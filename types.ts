export enum NavItem {
  Dashboard = 'Dashboard',
  Clients = 'Clients',
  Documents = 'Documents',
  Tasks = 'Tasks',
  Settings = 'Settings',
  Firms = 'Firms',
  Profile = 'Profile'
}

export enum UserRole {
  SuperAdmin = 'SuperAdmin',
  FirmOwner = 'Firm Owner',
  Manager = 'Manager',
  TaxPro = 'Tax Pro',
  Client = 'Client'
}

export const STAFF_ROLES = [UserRole.FirmOwner, UserRole.Manager, UserRole.TaxPro];

export const isStaffRole = (role: UserRole): boolean => STAFF_ROLES.includes(role);

export enum TaxReturnStatus {
  IntakeReceived = 'Intake Received',
  ComplianceReview = 'Compliance Review',
  InPreparation = 'In Preparation',
  MissingDocuments = 'Missing Documents',
  ReadyForSignature = 'Ready for Signature',
  InvoiceSent = 'Invoice Sent',
  BankProduct = 'Bank Product',
  Filed = 'Filed',
  Rejected = 'Rejected',
  Accepted = 'Accepted'
}

export interface Firm {
  id: string;
  name: string;
  logoUrl: string;
  ownerName: string;
  ownerEmail: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  staffCount: number;
  maxStaff: number;
  clientCount: number;
  installDate: string;
  ghlIntegrated: boolean;
  slug: string;
}

export const TAX_YEARS: Record<string, { label: string; isOpen: boolean }> = {
  "TY_2026": {
    "label": "2026",
    "isOpen": true
  },
  "TY_2025": {
    "label": "2025",
    "isOpen": true
  },
  "TY_2024": {
    "label": "2024",
    "isOpen": true
  },
  "TY_2023": {
    "label": "2023",
    "isOpen": false
  },
  "TY_2022": {
    "label": "2022",
    "isOpen": false
  },
  "TY_2021": {
    "label": "2021",
    "isOpen": false
  }
};

export const TAX_RETURN_TYPES: Record<string, { label: string; category: string }> = {
  "INDIVIDUAL_1040": {
    "label": "Individual Tax Return (Form 1040)",
    "category": "Individual"
  },
  "JOINT_1040": {
    "label": "Married Filing Jointly",
    "category": "Individual"
  },
  "SEPARATE_1040": {
    "label": "Married Filing Separately",
    "category": "Individual"
  },
  "HEAD_OF_HOUSEHOLD": {
    "label": "Head of Household",
    "category": "Individual"
  },
  "AMENDED_1040X": {
    "label": "Amended Individual Return (1040-X)",
    "category": "Amended"
  },
  "BUSINESS_SOLE_PROP": {
    "label": "Sole Proprietor (Schedule C)",
    "category": "Business"
  },
  "BUSINESS_PARTNERSHIP_1065": {
    "label": "Partnership Return (Form 1065)",
    "category": "Business"
  },
  "BUSINESS_S_CORP_1120S": {
    "label": "S Corporation Return (Form 1120-S)",
    "category": "Business"
  },
  "BUSINESS_C_CORP_1120": {
    "label": "C Corporation Return (Form 1120)",
    "category": "Business"
  },
  "FIDUCIARY_1041": {
    "label": "Estate or Trust Return (Form 1041)",
    "category": "Fiduciary"
  },
  "NONPROFIT_990": {
    "label": "Nonprofit Return (Form 990)",
    "category": "Nonprofit"
  },
  "STATE_ONLY": {
    "label": "State Only Return",
    "category": "State"
  },
  "LOCAL_ONLY": {
    "label": "Local or City Return",
    "category": "State"
  }
};

export const FILE_UPLOAD_TYPES: Record<string, { label: string; category: string }> = {
  "INCOME_W2": { "label": "W-2", "category": "Income" },
  "INCOME_1099_NEC": { "label": "1099-NEC", "category": "Income" },
  "INCOME_1099_MISC": { "label": "1099-MISC", "category": "Income" },
  "INCOME_1099_INT": { "label": "1099-INT", "category": "Income" },
  "INCOME_1099_DIV": { "label": "1099-DIV", "category": "Income" },
  "INCOME_1099_B": { "label": "1099-B", "category": "Income" },
  "INCOME_1099_R": { "label": "1099-R", "category": "Income" },
  "INCOME_1099_G": { "label": "1099-G", "category": "Income" },
  "INCOME_K1": { "label": "K-1", "category": "Income" },
  "INCOME_SSA_1099": { "label": "SSA-1099", "category": "Income" },
  "BUSINESS_PNL": { "label": "Profit and Loss Statement", "category": "Business" },
  "BUSINESS_EXPENSES": { "label": "Business Expense Summary", "category": "Business" },
  "BUSINESS_MILEAGE": { "label": "Mileage Log", "category": "Business" },
  "BUSINESS_HOME_OFFICE": { "label": "Home Office Expenses", "category": "Business" },
  "BUSINESS_ASSETS": { "label": "Asset Purchase Receipts", "category": "Business" },
  "BUSINESS_MERCHANT_STATEMENTS": { "label": "Merchant Statements", "category": "Business" },
  "BANK_STATEMENTS": { "label": "Bank Statements", "category": "Financial" },
  "CREDIT_CARD_STATEMENTS": { "label": "Credit Card Statements", "category": "Financial" },
  "MORTGAGE_1098": { "label": "Mortgage Interest Statement (1098)", "category": "Financial" },
  "PROPERTY_TAX": { "label": "Property Tax Statement", "category": "Financial" },
  "EDUCATION_1098_T": { "label": "Education Expenses (1098-T)", "category": "Credits and Deductions" },
  "STUDENT_LOAN_1098_E": { "label": "Student Loan Interest (1098-E)", "category": "Credits and Deductions" },
  "CHILDCARE_EXPENSES": { "label": "Childcare Expenses", "category": "Credits and Deductions" },
  "CHARITABLE_DONATIONS": { "label": "Charitable Donations", "category": "Credits and Deductions" },
  "HEALTH_INSURANCE_1095": { "label": "Health Insurance Forms (1095)", "category": "Credits and Deductions" },
  "DEPENDENT_INFO": { "label": "Dependent Information", "category": "Dependents" },
  "DEPENDENT_ID": { "label": "Dependent ID Documents", "category": "Dependents" },
  "CUSTODY_AGREEMENT": { "label": "Custody Agreement", "category": "Dependents" },
  "PHOTO_ID": { "label": "Government Issued Photo ID", "category": "Identity and Compliance" },
  "SSN_CARD": { "label": "Social Security Card", "category": "Identity and Compliance" },
  "ITIN_LETTER": { "label": "ITIN Letter", "category": "Identity and Compliance" },
  "PRIOR_YEAR_RETURN": { "label": "Prior Year Tax Return", "category": "Identity and Compliance" },
  "IRS_NOTICE": { "label": "IRS Notice or Letter", "category": "Identity and Compliance" },
  "REAL_ESTATE_CLOSING": { "label": "Real Estate Closing Statement", "category": "Property and Investments" },
  "RENTAL_INCOME": { "label": "Rental Income Summary", "category": "Property and Investments" },
  "RENTAL_EXPENSES": { "label": "Rental Expense Summary", "category": "Property and Investments" },
  "CRYPTO_STATEMENTS": { "label": "Cryptocurrency Statements", "category": "Property and Investments" },
  "BROKERAGE_STATEMENTS": { "label": "Brokerage Statements", "category": "Property and Investments" },
  "STATE_REFUND": { "label": "State Refund Statement", "category": "State and Local" },
  "OUT_OF_STATE_INCOME": { "label": "Out of State Income Documents", "category": "State and Local" },
  "ENTITY_DOCS": { "label": "Business Formation Documents", "category": "Business Entity" },
  "PAYROLL_REPORTS": { "label": "Payroll Reports", "category": "Business Entity" },
  "SALES_TAX_REPORTS": { "label": "Sales Tax Reports", "category": "Business Entity" },
  "OTHER_MISC": { "label": "Other Supporting Documents", "category": "Other" }
};

export type DocStatus = 'Uploaded' | 'Under Review' | 'Approved' | 'Rejected';

export interface TaxDocument {
  id: string;
  name: string;
  type: string;
  status: DocStatus;
  uploadDate: string;
  size: string;
}

export interface Task {
  task_id: string;
  firm_id: string;
  title: string;
  description?: string;
  type: 'firm' | 'client';
  priority: 'Low' | 'Medium' | 'High';
  assigned_to: string;
  assigned_to_name?: string;
  is_completed: boolean;
  completed_at?: string;
  due_date?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  sender: 'Client' | 'Professional' | 'AI';
  content: string;
  timestamp: string;
}

export interface TaxReturn {
  id: string;
  clientName: string;
  year: string;
  type: string;
  status: TaxReturnStatus;
  preparer: string;
  date: string;
  amount: string;
  agi: string;
  federalBalance: string;
  stateBalance: string;
  paymentType: string;
  internalNotes?: string;
  files: {
    name: string;
    size: string;
    type: string;
    status?: DocStatus;
    signatureStatus?: 'Pending' | 'Signed' | 'None';
  }[];
}