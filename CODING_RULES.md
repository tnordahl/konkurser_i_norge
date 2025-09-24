# 🚨 FUNDAMENTAL CODING RULES

## ⚖️ **THE GOLDEN RULE: ALWAYS BE GENERIC**

### 🚫 **NEVER ALLOWED:**

- ❌ Hardcoded kommune numbers (e.g., "4201")
- ❌ Hardcoded organization numbers (e.g., "989213598")
- ❌ Hardcoded company names (e.g., "DET LILLE HOTEL AS")
- ❌ Hardcoded city names (e.g., "RISØR", "OSLO")
- ❌ Hardcoded postal codes (e.g., "4950")
- ❌ Location-specific logic (`if (kommune === "4201")`)

## 🚨 **CRITICAL RULE: NO FAKE DATA**

### 🚫 **ABSOLUTELY FORBIDDEN:**

- ❌ **Synthetic/fake data generation** (e.g., creating fake address movements)
- ❌ **Misleading information** (e.g., showing "Unknown location" as previous address)
- ❌ **Artificial timelines** (e.g., fake "30 days" movement periods)
- ❌ **Mock verification statuses** (e.g., fake "verified" or "pending" states)
- ❌ **Placeholder data presented as real** (e.g., synthetic movement patterns)

### ✅ **REQUIRED INSTEAD:**

- ✅ **Show honest "No data available" messages**
- ✅ **Ask for guidance when data is lacking**
- ✅ **Only display real, verified information**
- ✅ **Clear indicators when data is incomplete**
- ✅ **Transparent about data limitations**

### ✅ **ALWAYS REQUIRED:**

- ✅ Generic algorithms that work for ANY kommune
- ✅ Dynamic pattern detection
- ✅ Configurable parameters
- ✅ Data-driven decisions
- ✅ API-based discovery

### 📋 **VALIDATION CHECKLIST:**

Before committing any code, verify:

1. [ ] No hardcoded kommune numbers
2. [ ] No hardcoded organization numbers
3. [ ] No hardcoded company names
4. [ ] No location-specific conditionals
5. [ ] Works for any Norwegian kommune
6. [ ] Uses dynamic data discovery
7. [ ] **No synthetic/fake data generation**
8. [ ] **No misleading information displayed**
9. [ ] **Honest about data limitations**
10. [ ] **Real data only, or clear "no data" messages**

### 🎯 **THE TESTS:**

**Test 1: Generic Code**
**"Would this code work for Tromsø (kommune 1902) without any changes?"**

- If NO → Fix it before committing
- If YES → Continue to Test 2

**Test 2: Data Integrity**
**"Is every piece of information displayed real and verified?"**

- If NO → Remove fake data, show honest status
- If YES → Good to go

---

_These rules override all other considerations. Generic code + Real data only = Foundation of a trustworthy fraud detection system._
