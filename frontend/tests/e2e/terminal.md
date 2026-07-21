### E2E Tests: Terminal chart

**Suite ID:** `TERMINAL-E2E`
**Feature:** Bounded NDX one-minute chart navigation.

## Test Case: `TERMINAL-E2E-001` - Load an older window on demand

**Priority:** `high`

**Tags:**
- type → @e2e
- feature → @terminal

**Preconditions:**
- The Vite terminal is running.
- Candle requests are intercepted with bounded API windows.

### Flow Steps:
1. Open the terminal.
2. Verify the first request loads the initial window only.
3. Select **Load older candles**.

### Expected Result:
- The first chart window renders.
- A second request carries the cursor returned by the first response.
- No full history is requested before navigation.

## Test Case: `TERMINAL-E2E-002` - Recover from a transient older-window failure

**Priority:** `high`

**Tags:**
- type → @e2e
- feature → @terminal

### Flow Steps:
1. Render the first candle window.
2. Make the first older-window request fail.
3. Select **Retry loading older candles**.

### Expected Result:
- The rendered chart remains visible during the failure.
- An accessible alert exposes a retry action.
- The successful retry merges the older window.
