# New Database Schema Design

## 🎯 Objective
- **Companies table**: ALL Norwegian companies (complete national database)
- **Specialized tables**: Risk companies, suspicious patterns, fraud indicators

## 📊 New Table Structure

### 1. Companies (Main Table) - ALL NORWEGIAN COMPANIES
```sql
-- This table contains EVERY company in Norway
model Company {
  id                    String                @id @default(cuid())
  organizationNumber    String                @unique
  name                  String
  organizationForm      String?               // AS, ASA, NUF, etc.
  status                String?               // Active, Dissolved, Bankruptcy, etc.
  registrationDate      DateTime?
  industry              String?
  industryCode          String?
  currentKommuneId      String?
  currentAddress        String?
  currentPostalCode     String?
  currentCity           String?
  businessAddress       Json?
  postalAddress         Json?
  employeeCount         Int?
  revenue               BigInt?
  lastUpdated           DateTime              @default(now())
  createdAt             DateTime              @default(now())
  
  // Relations
  currentKommune        Kommune?              @relation(fields: [currentKommuneId], references: [id])
  riskProfile           RiskCompany?          // 1-to-1 if company has risk factors
  addressChanges        AddressChangeAlert[]  // All suspicious address changes
  fraudIndicators       FraudIndicator[]      // All fraud-related flags
  
  @@index([organizationNumber])
  @@index([currentKommuneId])
  @@index([status])
  @@index([lastUpdated])
  @@map("companies")
}
```

### 2. RiskCompany (Risk Assessment Table)
```sql
-- Only companies with elevated risk factors
model RiskCompany {
  id                    String                @id @default(cuid())
  companyId             String                @unique
  organizationNumber    String                @unique
  riskScore             Int                   @default(0)
  riskLevel             String                // LOW, MEDIUM, HIGH, CRITICAL
  lastAssessment        DateTime              @default(now())
  
  // Risk factors
  hasAddressChanges     Boolean               @default(false)
  hasBankruptcyRisk     Boolean               @default(false)
  hasShellCompanyTraits Boolean               @default(false)
  hasNetworkConnections Boolean               @default(false)
  
  // Fraud indicators
  suspiciousPatterns    Json?                 // Array of detected patterns
  fraudScore            Int                   @default(0)
  investigationPriority Int                   @default(0) // 1-10
  
  // Monitoring
  monitoringStatus      String                @default("ACTIVE") // ACTIVE, PAUSED, RESOLVED
  nextReviewDate        DateTime?
  assignedInvestigator  String?
  
  // Relations
  company               Company               @relation(fields: [companyId], references: [id], onDelete: Cascade)
  addressChanges        AddressChangeAlert[]
  fraudIndicators       FraudIndicator[]
  investigations        Investigation[]
  
  @@index([riskScore])
  @@index([riskLevel])
  @@index([fraudScore])
  @@index([investigationPriority])
  @@index([monitoringStatus])
  @@map("risk_companies")
}
```

### 3. AddressChangeAlert (Suspicious Address Movements)
```sql
-- Tracks suspicious address changes that could indicate fraud
model AddressChangeAlert {
  id                    String                @id @default(cuid())
  companyId             String
  riskCompanyId         String?
  organizationNumber    String
  
  // Address change details
  fromAddress           String
  toAddress             String
  fromKommuneNumber     String?
  toKommuneNumber       String?
  fromKommuneName       String?
  toKommuneName         String?
  changeDate            DateTime
  
  // Suspicion factors
  alertLevel            String                // LOW, MEDIUM, HIGH, CRITICAL
  suspicionReasons      Json                  // Array of reasons why this is suspicious
  proximityToBankruptcy Int?                  // Days before/after bankruptcy
  crossKommuneMove      Boolean               @default(false)
  rapidSuccession       Boolean               @default(false) // Multiple moves in short time
  
  // Investigation status
  status                String                @default("PENDING") // PENDING, INVESTIGATING, RESOLVED, FALSE_POSITIVE
  investigatedAt        DateTime?
  investigatedBy        String?
  resolution            String?
  
  // Relations
  company               Company               @relation(fields: [companyId], references: [id], onDelete: Cascade)
  riskCompany           RiskCompany?          @relation(fields: [riskCompanyId], references: [id])
  
  @@index([organizationNumber])
  @@index([alertLevel])
  @@index([status])
  @@index([changeDate])
  @@index([fromKommuneNumber])
  @@index([toKommuneNumber])
  @@map("address_change_alerts")
}
```

### 4. FraudIndicator (Specific Fraud Patterns)
```sql
-- Specific fraud patterns and indicators detected
model FraudIndicator {
  id                    String                @id @default(cuid())
  companyId             String
  riskCompanyId         String?
  organizationNumber    String
  
  // Indicator details
  indicatorType         String                // SHELL_COMPANY, RAPID_DISSOLUTION, ASSET_STRIPPING, etc.
  severity              String                // LOW, MEDIUM, HIGH, CRITICAL
  confidence            Float                 // 0.0 - 1.0
  description           String
  evidence              Json                  // Supporting evidence and data
  
  // Detection metadata
  detectedAt            DateTime              @default(now())
  detectionMethod       String                // ALGORITHM, MANUAL, EXTERNAL_TIP
  detectedBy            String?               // System or user ID
  
  // Investigation
  status                String                @default("ACTIVE") // ACTIVE, INVESTIGATING, RESOLVED, FALSE_POSITIVE
  investigationNotes    String?
  resolvedAt            DateTime?
  
  // Relations
  company               Company               @relation(fields: [companyId], references: [id], onDelete: Cascade)
  riskCompany           RiskCompany?          @relation(fields: [riskCompanyId], references: [id])
  
  @@index([indicatorType])
  @@index([severity])
  @@index([status])
  @@index([detectedAt])
  @@index([organizationNumber])
  @@map("fraud_indicators")
}
```

### 5. Investigation (Investigation Cases)
```sql
-- Formal investigation cases
model Investigation {
  id                    String                @id @default(cuid())
  caseNumber            String                @unique
  riskCompanyId         String
  organizationNumber    String
  
  // Case details
  title                 String
  description           String
  priority              String                // LOW, MEDIUM, HIGH, URGENT
  status                String                // OPEN, IN_PROGRESS, CLOSED, SUSPENDED
  
  // Assignment
  assignedTo            String?
  assignedAt            DateTime?
  
  // Timeline
  openedAt              DateTime              @default(now())
  closedAt              DateTime?
  
  // Results
  findings              String?
  actionTaken           String?
  outcome               String?               // NO_ACTION, WARNING_ISSUED, REPORTED_TO_AUTHORITIES, etc.
  
  // Relations
  riskCompany           RiskCompany           @relation(fields: [riskCompanyId], references: [id])
  
  @@index([status])
  @@index([priority])
  @@index([assignedTo])
  @@index([openedAt])
  @@map("investigations")
}
```

## 🚀 Benefits of New Structure

### 1. Complete National Database
- **Companies table**: Every company in Norway
- **Scalable**: Can handle millions of records
- **Up-to-date**: Regular imports from Brønnøysundregistrene

### 2. Specialized Risk Management
- **RiskCompany**: Only companies with risk factors (much smaller, faster queries)
- **Focused monitoring**: Resources spent on actual risks
- **Automated scoring**: ML-based risk assessment

### 3. Detailed Fraud Tracking
- **AddressChangeAlert**: Specific suspicious movements
- **FraudIndicator**: Granular fraud patterns
- **Investigation**: Formal case management

### 4. Performance Optimization
- **Indexed tables**: Fast queries on risk data
- **Separate concerns**: General company data vs. risk assessment
- **Efficient storage**: Only store risk data when needed

## 📈 Data Flow

```
1. Import ALL companies → Companies table (5M+ records)
2. Risk analysis → Create RiskCompany record (10K+ records)
3. Pattern detection → Create FraudIndicator records
4. Address monitoring → Create AddressChangeAlert records
5. Investigation → Create Investigation cases
```

This structure allows us to:
- Have complete Norwegian company data
- Focus resources on actual risks
- Track specific fraud patterns
- Manage investigations efficiently
