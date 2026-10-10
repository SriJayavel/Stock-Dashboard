# Collaborative Workflow: Antigravity & Claude Symbiosis

## Core Dynamic
1. **Antigravity (Architect & Visual Director)**:
   - Evaluates user intent, screenshots, UI aesthetics, layout bugs, and architectural direction.
   - Diagnoses exact code locations, styling issues, and root causes.
   - Prepares surgical, high-precision prompts for the user to copy-paste into Claude in the terminal.
   - Inspects diffs, runs headless/Playwright validation on live servers, audits changes, and pushes commits to Git.

2. **Claude (Terminal Code Executor)**:
   - Receives the prepared prompts from the user in the CLI.
   - Performs code modifications in the working tree.

3. **Continuous Review Loop**:
   - User inputs visuals/feedback -> Antigravity generates precise prompt -> Claude executes -> Antigravity audits, tests, and commits.
