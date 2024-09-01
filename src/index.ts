import { createApp as initializeApp } from "@deroll/app";
import { createRouter as initializeRouter } from "@deroll/router";
import { createWallet } from "@deroll/wallet";
import {
  decodeFunctionData as decodeData,
  encodeFunctionData as encodeData,
  parseAbi as parseAbiDefinitions,
  Address,
  toHex as toHexString,
} from "viem";

const SERVER_URL =
  process.env.ROLLUP_HTTP_SERVER_URL ?? "http://127.0.0.1:5004";

const app = initializeApp({ url: SERVER_URL });

const contractAbi = parseAbiDefinitions([
  "function createProject(string,uint256,uint256,string)",
  "function contribute(uint256,uint256)",
  "function withdrawFunds(uint256)",
  "function refund(uint256)",
  "function updateProject(uint256,string,uint256,uint256,string)",
  "function cancelProject(uint256)",
  "function addReward(uint256,string,uint256)",
  "function claimReward(uint256,uint256)",
]);

// In-memory projects store
const projectRegistry = new Map<number, any>();

// Check if project exists in the registry
const doesProjectExist = (projectId: number) => projectRegistry.has(projectId);

// Check if the sender is the owner of the project
const isOwner = (projectId: number, sender: string) =>
  projectRegistry.get(projectId).creator === sender;

app.addAdvanceHandler(async ({ payload, metadata }) => {
  try {
    const { functionName, args } = decodeData({
      abi: contractAbi,
      data: payload,
    });
    let projectId,
      name,
      goal,
      deadline,
      description,
      amount,
      rewardDescription,
      rewardThreshold,
      rewardId;

    switch (functionName) {
      case "createProject":
        [name, goal, deadline, description] = args;
        projectId = projectRegistry.size + 1;
        projectRegistry.set(projectId, {
          creator: metadata.msg_sender,
          name,
          goal,
          deadline,
          description,
          totalFunds: 0n,
          contributors: new Map<string, bigint>(),
          rewards: [],
          status: "active",
        });
        app.createNotice({
          payload: toHexString(
            `New project created: ID ${projectId}, Name: ${name}, Goal: ${goal}, Deadline: ${deadline}`,
          ),
        });
        return "accept";

      case "contribute":
        [projectId, amount] = args;
        if (!doesProjectExist(projectId)) return "reject";
        const project = projectRegistry.get(projectId);
        if (
          Date.now() > Number(project.deadline) ||
          project.status !== "active"
        )
          return "reject";
        project.totalFunds += BigInt(amount);
        project.contributors.set(
          metadata.msg_sender,
          (project.contributors.get(metadata.msg_sender) || 0n) +
            BigInt(amount),
        );
        app.createNotice({
          payload: toHexString(
            `Contribution recorded: Project ID ${projectId}, Amount: ${amount}, From: ${metadata.msg_sender}`,
          ),
        });
        return "accept";

      case "withdrawFunds":
        [projectId] = args;
        if (
          !doesProjectExist(projectId) ||
          !isOwner(projectId, metadata.msg_sender)
        )
          return "reject";
        const projectToWithdraw = projectRegistry.get(projectId);
        if (
          projectToWithdraw.totalFunds < projectToWithdraw.goal ||
          Date.now() <= Number(projectToWithdraw.deadline) ||
          projectToWithdraw.status !== "active"
        )
          return "reject";
        app.createVoucher({
          destination: projectToWithdraw.creator,
          payload: encodeData({
            abi: parseAbiDefinitions(["function transfer(address,uint256)"]),
            functionName: "transfer",
            args: [projectToWithdraw.creator, projectToWithdraw.totalFunds],
          }),
        });
        app.createNotice({
          payload: toHexString(
            `Funds withdrawn: Project ID ${projectId}, Amount: ${projectToWithdraw.totalFunds}, To: ${projectToWithdraw.creator}`,
          ),
        });
        projectToWithdraw.totalFunds = 0n;
        projectToWithdraw.status = "successful";
        return "accept";

      case "refund":
        [projectId] = args;
        if (!doesProjectExist(projectId)) return "reject";
        const projectToRefund = projectRegistry.get(projectId);
        if (
          projectToRefund.totalFunds >= projectToRefund.goal ||
          Date.now() <= Number(projectToRefund.deadline) ||
          projectToRefund.status !== "active"
        )
          return "reject";
        const contributionAmount =
          projectToRefund.contributors.get(metadata.msg_sender) || 0n;
        if (contributionAmount === 0n) return "reject";
        app.createVoucher({
          destination: metadata.msg_sender,
          payload: encodeData({
            abi: parseAbiDefinitions(["function transfer(address,uint256)"]),
            functionName: "transfer",
            args: [metadata.msg_sender, contributionAmount],
          }),
        });
        app.createNotice({
          payload: toHexString(
            `Refund processed: Project ID ${projectId}, Amount: ${contributionAmount}, To: ${metadata.msg_sender}`,
          ),
        });
        projectToRefund.totalFunds -= contributionAmount;
        projectToRefund.contributors.delete(metadata.msg_sender);
        if (projectToRefund.totalFunds === 0n) {
          projectToRefund.status = "failed";
        }
        return "accept";

      case "updateProject":
        [projectId, name, goal, deadline, description] = args;
        if (
          !doesProjectExist(projectId) ||
          !isOwner(projectId, metadata.msg_sender)
        )
          return "reject";
        const projectToUpdate = projectRegistry.get(projectId);
        if (projectToUpdate.status !== "active") return "reject";
        projectToUpdate.name = name;
        projectToUpdate.goal = goal;
        projectToUpdate.deadline = deadline;
        projectToUpdate.description = description;
        app.createNotice({
          payload: toHexString(
            `Project updated: ID ${projectId}, New Name: ${name}, New Goal: ${goal}, New Deadline: ${deadline}`,
          ),
        });
        return "accept";

      case "cancelProject":
        [projectId] = args;
        if (
          !doesProjectExist(projectId) ||
          !isOwner(projectId, metadata.msg_sender)
        )
          return "reject";
        const projectToCancel = projectRegistry.get(projectId);
        if (projectToCancel.status !== "active") return "reject";
        projectToCancel.status = "cancelled";
        app.createNotice({
          payload: toHexString(`Project cancelled: ID ${projectId}`),
        });
        return "accept";

      case "addReward":
        [projectId, rewardDescription, rewardThreshold] = args;
        if (
          !doesProjectExist(projectId) ||
          !isOwner(projectId, metadata.msg_sender)
        )
          return "reject";
        const projectToAddReward = projectRegistry.get(projectId);
        if (projectToAddReward.status !== "active") return "reject";
        const newReward = {
          id: projectToAddReward.rewards.length + 1,
          description: rewardDescription,
          threshold: rewardThreshold,
          claimed: new Set<string>(),
        };
        projectToAddReward.rewards.push(newReward);
        app.createNotice({
          payload: toHexString(
            `Reward added: Project ID ${projectId}, Reward ID ${newReward.id}, Threshold: ${rewardThreshold}`,
          ),
        });
        return "accept";

      case "claimReward":
        [projectId, rewardId] = args;
        projectId = parseInt(projectId.toString());
        if (!doesProjectExist(parseInt(projectId.toString()))) return "reject";
        const projectToClaimReward = projectRegistry.get(projectId);
        if (projectToClaimReward.status !== "successful") return "reject";
        const reward = projectToClaimReward.rewards.find(
          //@ts-ignore
          (r: any) => r.id === rewardId,
        );
        if (!reward) return "reject";
        const contributorAmount =
          projectToClaimReward.contributors.get(metadata.msg_sender) || 0n;
        if (
          contributorAmount < reward.threshold ||
          reward.claimed.has(metadata.msg_sender)
        )
          return "reject";
        reward.claimed.add(metadata.msg_sender);
        app.createNotice({
          payload: toHexString(
            `Reward claimed: Project ID ${projectId}, Reward ID ${rewardId}, Claimer: ${metadata.msg_sender}`,
          ),
        });
        return "accept";
    }
  } catch (error) {
    return "reject";
  }
});

const router = initializeRouter({ app });

router.add<{ projectId: string }>(
  "project/:projectId",
  ({ params: { projectId } }) => {
    const project = projectRegistry.get(Number(projectId));
    if (!project) return JSON.stringify({ error: "Project not found" });
    return JSON.stringify({
      id: projectId,
      name: project.name,
      creator: project.creator,
      goal: project.goal.toString(),
      deadline: project.deadline,
      description: project.description,
      totalFunds: project.totalFunds.toString(),
      contributorsCount: project.contributors.size,
      status: project.status,
      rewards: project.rewards.map((r: any) => ({
        id: r.id,
        description: r.description,
        threshold: r.threshold.toString(),
        claimedCount: r.claimed.size,
      })),
    });
  },
);

router.add("projects", () => {
  return JSON.stringify(
    Array.from(projectRegistry.entries()).map(([id, project]) => ({
      id,
      name: project.name,
      goal: project.goal.toString(),
      totalFunds: project.totalFunds.toString(),
      status: project.status,
      deadline: project.deadline,
    })),
  );
});

router.add<{ address: string }>(
  "contributions/:address",
  ({ params: { address } }) => {
    const contributions = [];
    for (const [projectId, project] of projectRegistry.entries()) {
      const amount = project.contributors.get(address);
      if (amount) {
        contributions.push({ projectId, amount: amount.toString() });
      }
    }
    return JSON.stringify(contributions);
  },
);

// start app
app.start().catch((e) => process.exit(1));
