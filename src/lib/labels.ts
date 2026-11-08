// Fixed label lists the screens use in BOTH modes (role names, lab-test and medicine categories). They are constants of the product, not sample records, so they live outside
// src/data, which is the demo-only folder reachable only through the "@hms/demo" seam (src/lib/demo). src/data re-exports them for the demo's own modules.

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  doctor: "Doctor",
  receptionist: "Receptionist",
  billing: "Billing",
  lab_tech: "Lab Technician",
  pharmacist: "Pharmacist",
  nurse: "Nurse",
}

export const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: "bg-navy-700 text-white",
  doctor: "bg-teal-600 text-white",
  receptionist: "bg-success-600 text-white",
  billing: "bg-warning-600 text-white",
  lab_tech: "bg-purple-600 text-white",
  pharmacist: "bg-orange-600 text-white",
  nurse: "bg-pink-600 text-white",
}

export const LAB_TEST_CATEGORIES = [
  "Haematology", "Biochemistry", "Serology", "Urine Analysis", "Cardiology", "Radiology",
] as const

export const MEDICINE_CATEGORIES = [
  "Antibiotic", "Analgesic", "Antidiabetic", "Antihypertensive", "NSAID", "PPI",
  "Bronchodilator", "Vitamin/Supplement", "Antiemetic", "Antifungal", "Steroid",
  "Injection", "Other",
]
