# Movement Detection Issue - Root Cause & Solution

## Problem

"Det lille hotel" (org: 989213598) is not being detected on kommune pages even though it has address history showing movement between kommuner.

## Investigation

### Test Data

- **Organization Number**: 989213598
- **Company Name**: DET LILLE HOTEL AS
- **Address History**:
  - Kristiansand (kommune 4204): 2006-01-21 to 2020-01-01
  - Oslo (kommune 0301): 2020-01-01 to present
- **Issues with test data**:
  1. Duplicate address entries (2x Kristiansand, 2x Oslo)
  2. Move date is 2020 (over 5 years ago, not within last 6 months as expected)

### Root Causes

#### 1. **Address History Filtering Issue** (PRIMARY ISSUE)

The query in `/app/api/advanced-movement-detection/[kommuneNumber]/route.ts` has a critical flaw:

**Lines 188-208**: When including address history, it filters addresses by:

```typescript
addressHistory: {
  where: {
    OR: [
      { fromDate: { gte: cutoffDate } }, // Moved TO recently
      { toDate: { gte: cutoffDate } },   // Moved OUT recently (added in fix)
      { kommuneNumber },                  // In target kommune
    ],
  },
}
```

**Problem**: When querying kommune 4204 (Kristiansand):

- Kristiansand addresses ARE included (matches `{ kommuneNumber }`)
- Oslo addresses are NOT included (doesn't match any criteria for kommune 4204)
- After deduplication: 1 Kristiansand address, 0 Oslo addresses
- Company is SKIPPED because `addressHistory.length < 2`

**Result**: Companies that moved OUT of a kommune aren't detected because the destination address is filtered out.

#### 2. **Missing Adjacent Address Logic**

To detect movements, we need at least 2 addresses:

- The "from" address (in the target kommune)
- The "to" address (destination, possibly outside the kommune)

Currently, the system only includes addresses that directly involve the target kommune, missing the destination address for outbound movements.

## Solutions

### Solution 1: Include Adjacent Addresses (RECOMMENDED)

For each address in the target kommune, include the immediately adjacent address (before and after) regardless of its kommune:

```typescript
// Fetch companies
const companiesWithMovements = await prisma.company.findMany({
  where: {
    /* existing WHERE clause */
  },
  include: {
    addressHistory: {
      // NO WHERE clause - get ALL addresses
      orderBy: { fromDate: "desc" },
    },
  },
});

// Filter addresses POST-query to include adjacent addresses
const companiesWithRelevantHistory = companiesWithMovements.map((company) => {
  const allAddresses = company.addressHistory;
  const relevantIndices = new Set<number>();

  // Find addresses in target kommune
  allAddresses.forEach((addr, idx) => {
    if (
      addr.kommuneNumber === kommuneNumber ||
      (addr.fromDate && addr.fromDate >= cutoffDate) ||
      (addr.toDate && addr.toDate >= cutoffDate)
    ) {
      relevantIndices.add(idx); // Include this address
      if (idx > 0) relevantIndices.add(idx - 1); // Include previous
      if (idx < allAddresses.length - 1) relevantIndices.add(idx + 1); // Include next
    }
  });

  const relevantAddresses = Array.from(relevantIndices)
    .sort((a, b) => a - b)
    .map((idx) => allAddresses[idx]);

  return {
    ...company,
    addressHistory: relevantAddresses,
  };
});
```

**Pros**:

- Captures full movement patterns
- Shows both origin and destination
- Works for both inbound and outbound movements

**Cons**:

- Slightly more complex logic
- Fetches more data from database

### Solution 2: Separate Queries for Inbound/Outbound

Run separate queries for:

1. Companies that moved INTO the kommune (current address in kommune)
2. Companies that moved OUT of the kommune (previous address in kommune, current elsewhere)

**Pros**:

- Clear separation of concerns
- Easier to understand

**Cons**:

- Two database queries
- More code duplication

### Solution 3: Remove Length Filter

Remove the `addressHistory.length < 2` check and allow companies with single addresses, then handle them in the pattern analysis.

**Pros**:

- Simplest fix

**Cons**:

- Can't create movement patterns with only 1 address
- Doesn't solve the core problem

## Recommended Implementation

Implement **Solution 1** with these steps:

1. Remove WHERE clause from address history include
2. Add post-query filtering to include adjacent addresses
3. Add logic to handle cases where movement spans multiple addresses
4. Update duplicate removal to preserve chronological order

## Additional Fixes Needed

1. **Remove duplicate address entries** in test data
2. **Update move date** in test data to be recent (within 6 months)
3. **Add proper address change detection** when scanning from Brreg API
4. **Implement incremental updates** to detect when companies change addresses

## Test Cases

After implementing the fix, verify:

1. ✅ Companies that moved OUT of a kommune are detected
2. ✅ Companies that moved INTO a kommune are detected
3. ✅ Companies with multiple address changes show all relevant transitions
4. ✅ Recent movements (within timeframe) are prioritized
5. ✅ Old movements (outside timeframe) are excluded unless they involve the target kommune
6. ✅ Duplicate addresses are properly cleaned

## Non-Hard-Coded Approach

The solution should be **generic** and work for ANY kommune without hard-coding:

- ✅ Uses dynamic kommune number from request
- ✅ Filters by configurable timeframe
- ✅ Works with any company regardless of location
- ✅ Discovers movements through database queries, not manual imports
