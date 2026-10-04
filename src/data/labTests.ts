import type { LabTest } from "@/types"

export const LAB_TESTS: LabTest[] = [
  {
    id: 1, code: "CBC", name: "Complete Blood Count", category: "Haematology", rate: 600,
    unit: "-", normalRange: "-", turnaroundHours: 3,
    parameters: [
      { parameter: "Haemoglobin", unit: "g/dL", normalLow: 12.0, normalHigh: 16.0 },
      { parameter: "TLC", unit: "×10³/µL", normalLow: 4.0, normalHigh: 11.0 },
      { parameter: "Platelets", unit: "×10³/µL", normalLow: 150, normalHigh: 400 },
      { parameter: "Neutrophils %", unit: "%", normalLow: 40, normalHigh: 70 },
      { parameter: "Lymphocytes %", unit: "%", normalLow: 20, normalHigh: 40 },
      { parameter: "Haematocrit (PCV)", unit: "%", normalLow: 36, normalHigh: 46 },
    ],
  },
  { id: 2, code: "ESR", name: "Erythrocyte Sedimentation Rate", category: "Haematology", rate: 300, unit: "mm/hr", normalRange: "0–20", turnaroundHours: 2 },
  { id: 3, code: "URE", name: "Urine Routine Examination", category: "Urine Analysis", rate: 400, unit: "-", normalRange: "-", turnaroundHours: 2 },
  { id: 4, code: "RBS", name: "Random Blood Sugar", category: "Biochemistry", rate: 200, unit: "mg/dL", normalRange: "70–140", turnaroundHours: 1 },
  { id: 5, code: "FBS", name: "Fasting Blood Sugar", category: "Biochemistry", rate: 200, unit: "mg/dL", normalRange: "70–110", turnaroundHours: 1 },
  {
    id: 6, code: "LIPID", name: "Lipid Profile", category: "Biochemistry", rate: 1200,
    unit: "-", normalRange: "-", turnaroundHours: 6,
    parameters: [
      { parameter: "Total Cholesterol", unit: "mg/dL", normalLow: 0, normalHigh: 200 },
      { parameter: "Triglycerides", unit: "mg/dL", normalLow: 0, normalHigh: 150 },
      { parameter: "HDL", unit: "mg/dL", normalLow: 40, normalHigh: 60 },
      { parameter: "LDL", unit: "mg/dL", normalLow: 0, normalHigh: 100 },
    ],
  },
  {
    id: 7, code: "LFTS", name: "Liver Function Tests", category: "Biochemistry", rate: 1000,
    unit: "-", normalRange: "-", turnaroundHours: 6,
    parameters: [
      { parameter: "Bilirubin Total", unit: "mg/dL", normalLow: 0.1, normalHigh: 1.2 },
      { parameter: "ALT (SGPT)", unit: "U/L", normalLow: 7, normalHigh: 56 },
      { parameter: "AST (SGOT)", unit: "U/L", normalLow: 5, normalHigh: 40 },
      { parameter: "Alkaline Phosphatase", unit: "U/L", normalLow: 44, normalHigh: 147 },
    ],
  },
  {
    id: 8, code: "KFTS", name: "Kidney Function Tests", category: "Biochemistry", rate: 1000,
    unit: "-", normalRange: "-", turnaroundHours: 6,
    parameters: [
      { parameter: "Urea", unit: "mg/dL", normalLow: 15, normalHigh: 40 },
      { parameter: "Creatinine", unit: "mg/dL", normalLow: 0.6, normalHigh: 1.3 },
      { parameter: "Uric Acid", unit: "mg/dL", normalLow: 3.4, normalHigh: 7.0 },
    ],
  },
  { id: 9, code: "HBA1C", name: "HbA1c", category: "Biochemistry", rate: 1200, unit: "%", normalRange: "4.0–5.6", turnaroundHours: 4 },
  { id: 10, code: "HEPBAG", name: "Hepatitis B Surface Antigen", category: "Serology", rate: 700, unit: "-", normalRange: "Non-Reactive", turnaroundHours: 4 },
  { id: 11, code: "HEPCAB", name: "Hepatitis C Antibody", category: "Serology", rate: 700, unit: "-", normalRange: "Non-Reactive", turnaroundHours: 4 },
  { id: 12, code: "TYPHOID", name: "Typhoid (Widal Test)", category: "Serology", rate: 500, unit: "-", normalRange: "Negative", turnaroundHours: 3 },
  { id: 13, code: "ECG", name: "Electrocardiogram", category: "Cardiology", rate: 500, unit: "-", normalRange: "-", turnaroundHours: 1, narrative: true },
  { id: 14, code: "XRAYCHEST", name: "X-Ray Chest", category: "Radiology", rate: 800, unit: "-", normalRange: "-", turnaroundHours: 2, narrative: true },
  { id: 15, code: "USG", name: "Ultrasound Abdomen", category: "Radiology", rate: 2500, unit: "-", normalRange: "-", turnaroundHours: 3, narrative: true },
]

export function getLabTest(id: number): LabTest | undefined {
  return LAB_TESTS.find((t) => t.id === id)
}

export const LAB_TEST_CATEGORIES = [
  "Haematology", "Biochemistry", "Serology", "Urine Analysis", "Cardiology", "Radiology",
] as const
