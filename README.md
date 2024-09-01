# Kicky

## Overview

This is a decentralized Kickstarter-like application built on the Cartesi platform. It allows users to create and manage crowdfunding projects, contribute to projects, and claim rewards, all within a decentralized environment.

## Features

- Create crowdfunding projects with customizable names, goals, deadlines, and descriptions
- Contribute to existing projects
- Project creators can withdraw funds when goals are met
- Contributors can request refunds for unsuccessful projects
- Add and claim rewards
- View project details and list of all projects
- Check contributions made by a specific address

## Prerequisites

- Node.js (v14 or later)
- Cartesi Rollups environment

## Installation

1. Clone the repository:

```
git clone https://github.com/pnpix/kicky.git
cd kicky
```

2. Install dependencies:

```
pnpm install
```

## Configuration

Set the `ROLLUP_HTTP_SERVER_URL` environment variable to your Cartesi Rollups server URL. By default, it uses `http://127.0.0.1:5004`.

## Running the DApp

To start the DApp run:

```
cartesi build
cartesi run
```

## Functionality

### For Project Creators

1. `createProject(string name, uint256 goal, uint256 deadline, string description)`

   - Creates a new crowdfunding project

2. `updateProject(uint256 projectId, string name, uint256 goal, uint256 deadline, string description)`

   - Updates an existing project's details

3. `cancelProject(uint256 projectId)`

   - Cancels an active project

4. `addReward(uint256 projectId, string rewardDescription, uint256 rewardThreshold)`

   - Adds a new reward to a project

5. `withdrawFunds(uint256 projectId)`
   - Withdraws funds from a successful project

### For Contributors

1. `contribute(uint256 projectId, uint256 amount)`

   - Contributes to a project

2. `refund(uint256 projectId)`

   - Requests a refund for an unsuccessful project

3. `claimReward(uint256 projectId, uint256 rewardId)`
   - Claims a reward from a successful project

## Inspect Endpoints

1. `GET /project/:projectId`

   - Retrieves details of a specific project

2. `GET /projects`

   - Lists all projects

3. `GET /contributions/:address`
   - Lists all contributions made by a specific address

## Development

This DApp is built using the following Cartesi tools and libraries:

- @deroll/app
- @deroll/router
- @deroll/wallet
- viem
