# Playwright Testing Skill

This skill provides helpful commands and guidance for working with Playwright tests in the Stock-Dashboard project.

## Project Context
- Playwright is already installed in `frontend/` as a devDependency
- Test scripts are configured in `frontend/package.json`
- Configuration file: `frontend/playwright.config.js`
- Existing tests: `frontend/tests/smoke.spec.js`

## Available Commands

### Run Tests
- `npm run test:smoke` (in frontend/) - Runs the smoke test suite
- `npx playwright test` - Runs all tests
- `npx playwright test tests/smoke.spec.js` - Runs specific test file
- `npx playwright test --headed` - Runs tests in headed mode (visible browser)
- `npx playwright test --debug` - Runs tests in debug mode

### Development & Maintenance
- `npx playwright test --update-snapshots` - Updates visual snapshots
- `npx playwright codegen` - Opens test recorder to generate new tests
- `npx playwright install` - Installs browsers (if needed)
- `npm install -D playwright@latest` - Updates Playwright to latest version

### Common Workflows
1. **Creating a new test**:
   ```bash
   # From project root
   cd frontend
   npx playwright codegen https://your-app-url  # Record interactions
   # Or manually create a test file in frontend/tests/
   ```

2. **Running tests with CI-like settings**:
   ```bash
   cd frontend
   npx playwright test --workers=1 --retries=2
   ```

3. **Checking test results**:
   - View HTML report: `npx playwright show-report`
   - Test results are saved in `frontend/playwright-report/` after running

## Skill Usage Guidelines

When invoked, this skill can help with:
- Explaining Playwright commands and options
- Helping debug test failures by suggesting common fixes
- Providing templates for new test files
- Explaining how to run specific test scenarios

**Note**: This skill provides guidance and command suggestions - actual test execution should be done via the terminal using the commands above.

## Example Interactions

User: "How do I run just the smoke test?"
Skill Response: "Run `cd frontend && npm run test:smoke` or `npx playwright test tests/smoke.spec.js`"

User: "My test is failing, how can I see what happened?"
Skill Response: "Try running with `--headed` flag to see the browser, or `--trace on` to capture trace data. After failure, check `npx playwright show-report` for detailed error info."

User: "I want to create a test for the login flow."
Skill Response: "Use `npx playwright codegen` to record interactions, or create a new file in `frontend/tests/` following the existing test patterns."
