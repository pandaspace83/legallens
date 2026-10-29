# LegalLens on Azure: step by step

> **Status:** Draft 2026-10-28, waiting for your go-ahead on AZ-0 · **You click, Claude guides.**
> IDs: `AZ-<phase>.<n>`. Related decisions: DEC-96 ($5 cap on new spend, Claude calls plus any cloud), DEC-95 (public or
> synthetic documents only), DEC-73 (no real client data yet). Images and the compose file are already on `main`
> ([backend/DOCKER.md](backend/DOCKER.md), [docker-compose.yml](docker-compose.yml)).

## How we work

- **One step at a time.** Claude says what to do, why, what it costs and the check that proves it. You do the portal and
  `az` steps (they are your account and your money); Claude reviews, runs checks and writes files when you ask.
- **Cost first.** Every step that creates something billable states the estimate and waits for your yes. Prices below
  are rough; confirm each in the Azure pricing calculator before creating the resource.
- **Nothing runs overnight by accident.** End each session with "AZ-7.1 stop for the day" until the teardown is done.
- **No real client data (DEC-73, DEC-95).** The deployment holds synthetic documents only, with `auth_mode=dev`.

## AZ-0: Decide first (nothing is created)

- [ ] **AZ-0.1 What does the $5 cap cover?** DEC-96 counts Azure. An AKS node costs more than $5 in a few days, so pick:
      **(a)** the Azure free account's trial credit (a time-limited credit, no card charges while it lasts) does not
      count against the $5; **(b)** the $5 stays a hard cap and we choose the cheapest target; **(c)** raise the cap
      for this phase. *Output:* one line in `IDEAS.md` (a new `DEC-nn`).
- [ ] **AZ-0.2 Where does it run?** Cheapest first: **Container Apps** (scales to zero, no cluster to run) · **App
      Service for containers** (always on, one small plan) · **AKS** (what the Docker work was shaped for: probes,
      volumes, one replica). AKS teaches the most and costs the most; Claude recommends starting on Container Apps only
      if the goal is "get it live", and AKS if the goal is the Kubernetes skills. *Output:* your choice and why.
- [ ] **AZ-0.3 Region and names.** One region near you (for example `eastus2`; check which has your target service),
      and a prefix such as `ll` (names: `rg-ll-dev`, `acrll...`, `ll-dev-...`). *Output:* the table in AZ-1.3.

## AZ-1: Account and safety nets (before any resource)

- [ ] **AZ-1.1 Create the account** at azure.microsoft.com/free with your personal email. Turn on MFA for the
      sign-in. *Check:* you reach portal.azure.com and see one subscription.
- [ ] **AZ-1.2 Know which kind of subscription this is.** Free account (has a built-in spending limit that disables
      resources when the credit runs out) or pay-as-you-go (no limit; it just bills). *Check:* Subscriptions, then your
      subscription, and write down the type and the credit left.
- [ ] **AZ-1.3 Budget with alerts.** Cost Management, Budgets: a monthly budget of **$5** with email alerts at 20%, 60%,
      100%. *Know this:* budgets only send email; they do not stop anything. *Check:* a test alert threshold shows in
      the list.
- [ ] **AZ-1.4 Install and sign in to the CLI.** `brew install azure-cli`, `az login`, `az account show`. *Check:* the
      subscription id matches the portal. Never paste tokens, secrets or the subscription id into the repo.

## AZ-2: Resource group and base resources

- [ ] **AZ-2.1 One resource group for everything.** `az group create -n rg-ll-dev -l <region> --tags project=legallens
      env=dev owner=<you>`. *Why one:* AZ-7.2 deletes everything with a single command. *Check:* `az group show`.
- [ ] **AZ-2.2 Log workspace (only if the target needs it).** Container Apps and AKS log to a Log Analytics workspace;
      the first GB a month is free, more is billed. Set a daily cap of 0.1 GB. *Check:* the cap shows in the workspace.

## AZ-3: Where the images live

- [ ] **AZ-3.1 Pick a registry.** **GitHub Container Registry** is free and CI already has a token for it; **Azure
      Container Registry (Basic)** is about $0.17 a day and pulls from Azure without extra setup. Claude recommends GHCR
      while the cap is $5. *Output:* the choice.
- [ ] **AZ-3.2 Push the two images by hand once.** `docker tag` and `docker push` for `legallens-backend` and
      `legallens-frontend`, built `--platform linux/amd64`. *Check:* both appear with a tag in the registry.

## AZ-4: CI builds and pushes the images

- [ ] **AZ-4.1 A workflow that builds on merge to `main`** (`.github/workflows/images.yml`): builds both Dockerfiles and
      pushes `:<commit sha>` tags. It runs only on `main`, never on every pull request. *Check:* a merged change
      produces new tags.
- [ ] **AZ-4.2 Sign in to Azure from GitHub without a stored secret** (only if the registry or deploy needs Azure):
      an app registration with a federated credential for this repo and branch (`azure/login` with OIDC). *Check:* a
      workflow run prints the subscription name, and `gitleaks` stays green. No client secret is created.
- [ ] **AZ-4.3 Scan the images in CI** (Trivy or the registry's scanner) and fail on critical findings. *Check:* a run
      reports a count.

## AZ-5: Run it

*(Steps depend on AZ-0.2; Claude fills in the exact commands when you choose.)*

- [ ] **AZ-5.1 Storage for `/data`.** SQLite needs a disk that locks properly. Azure Files over SMB can misbehave with
      SQLite; a managed disk (AKS) or a single always-on instance is safer. Exactly one replica. *Check:* data
      survives a restart (seed, restart, still there).
- [ ] **AZ-5.2 Backend.** Env from `backend/env.docker.example`, `LEGALLENS_AUTH_MODE=dev`, scanner `none`, stub or
      Claude orchestrator. Secrets (an API key) go in the platform's secret store, never in the image or the repo.
      *Check:* `/api/v1/health` returns 200 through the platform.
- [ ] **AZ-5.3 Frontend.** `API_UPSTREAM` points at the backend's internal address; only the frontend is public.
      *Check:* the public URL loads the app and the matters list shows after sign-in.
- [ ] **AZ-5.4 HTTPS and access.** Platform HTTPS only. Restrict who can reach it (an IP allow-list or sign-in in front)
      because dev sign-in accepts any password. *Check:* a request from another network is refused.
- [ ] **AZ-5.5 Probes.** Liveness: frontend `/healthz`, backend `/api/v1/health` (status 200). Readiness: the backend
      `ok` fields, not only the status code. *Check:* stopping the backend turns the app unready, not just slow.

## AZ-6: Watch and keep it healthy

- [ ] **AZ-6.1 Read the logs.** Container stdout reaches the log workspace; run one query for errors in the last hour.
      DEC-68 still applies: the check is that no document text appears. *Check:* the query returns rows, none with
      client text.
- [ ] **AZ-6.2 A deploy from CI.** A merged change reaches the running app by image tag, with one rollback to the
      previous tag. *Check:* roll forward, then back.

## AZ-7: Stop spending

- [ ] **AZ-7.1 Stop for the day.** Scale to zero or stop the app/cluster. *Check:* the cost view shows no running compute.
- [ ] **AZ-7.2 Tear down.** `az group delete -n rg-ll-dev` (Claude asks you to type the name to confirm). *Check:*
      `az group list` is empty and the next day's cost view shows nothing.
- [ ] **AZ-7.3 Write down the real cost** next to the estimates, as DEC-96 did for Claude calls.

## Open questions

- Which target (AZ-0.2) and which budget reading (AZ-0.1)? Everything after AZ-3 depends on them.
- Is a public URL needed at all, or is a private demo (an IP allow-list) enough?
