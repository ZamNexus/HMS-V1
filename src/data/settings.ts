import type { ClinicSettings, AuditLogEntry } from "@/types"

export const CLINIC_SETTINGS: ClinicSettings = {
  nameEn: "Citi Clinic",
  nameUr: "عيادة المدينة",
  address: "Scheme III, Bostan Khan Road, Rawalpindi, Pakistan",
  phone: "051-1234567",
  email: "info@citiclinic.pk",
  tagline: "Quality Healthcare, Compassionate Care",
  printHeader: "Citi Clinic | Scheme III, Rawalpindi | Ph: 051-1234567",
  currencySymbol: "Rs.",
  defaultCity: "Rawalpindi",
  timezone: "Asia/Karachi (PKT, UTC+5)",
  fiscalYearStart: "July",
}

export const AUDIT_LOG: AuditLogEntry[] = [
  { id: 1, user: "Dr. Ahmed Raza", action: "Created", module: "Patients", recordId: "MR-2024-0020", timestamp: "2024-08-27 09:12" },
  { id: 2, user: "Fatima Malik", action: "Created", module: "Encounters", recordId: "OPD-2024-0012", timestamp: "2024-08-24 12:05" },
  { id: 3, user: "Ali Hassan", action: "Updated", module: "Billing", recordId: "CI-2024-0007", timestamp: "2024-08-21 10:40" },
  { id: 4, user: "Zara Ahmed", action: "Updated", module: "Laboratory", recordId: "LB-2024-0007", timestamp: "2024-08-15 09:30" },
  { id: 5, user: "Omar Farooq", action: "Created", module: "Pharmacy", recordId: "DIS-2024-0012", timestamp: "2024-08-24 12:20" },
  { id: 6, user: "Dr. Ahmed Raza", action: "Deactivated", module: "Users", recordId: "zeeshan.h@citiclinic.pk", timestamp: "2024-08-18 14:02" },
]
