import type { Encounter } from "@/types"
import { shiftDate } from "@/lib/dateShift"

const emptyVitals = (bp: string, pulse: string, temp: string, weight: string, spo2: string, rbs: string) => ({
  bp, pulse, temp, weight, spo2, rbs,
})

const RAW_ENCOUNTERS: Encounter[] = [
  {
    id: 1, encId: "OPD-2024-0001", patientId: 1, type: "OPD", doctorId: 2, date: "2024-08-20T09:00:00",
    tokenNo: 12, priority: "Normal",
    chiefComplaint: "Sore throat and fever for 3 days", history: "No previous similar episodes.",
    onExamination: "Congested pharynx, tonsils enlarged grade 2.", diagnosis: "Acute pharyngitis",
    clinicalNotes: "Advised warm saline gargles.",
    vitals: emptyVitals("120/80", "82", "100.4", "70", "98", "-"),
    prescription: [
      { medicine: "Augmentin 625mg", dose: "1 tab", route: "Oral", frequency: "BD", duration: "5 days", instructions: "After meals" },
      { medicine: "Panadol 500mg", dose: "1 tab", route: "Oral", frequency: "SOS", duration: "3 days", instructions: "If fever > 100°F" },
    ],
    generalInstructions: "Plenty of fluids, rest.", followUpDate: "2024-08-27",
    fee: 800, discount: 0, discountType: "flat", netTotal: 800,
    paymentStatus: "paid", paymentMode: "Cash", amountReceived: 800, balance: 0, status: "open",
  },
  {
    id: 2, encId: "OPD-2024-0002", patientId: 5, type: "OPD", doctorId: 2, date: "2024-08-20T09:30:00",
    tokenNo: 13, priority: "Normal",
    chiefComplaint: "Follow-up for diabetes", history: "Known T2DM for 6 years, on Metformin.",
    onExamination: "No acute distress. Feet examination normal.", diagnosis: "T2DM follow-up",
    clinicalNotes: "HbA1c review advised.",
    vitals: emptyVitals("130/85", "76", "98.6", "82", "97", "165"),
    prescription: [
      { medicine: "Metformin 500mg", dose: "1 tab", route: "Oral", frequency: "BD", duration: "30 days", instructions: "After meals" },
      { medicine: "Atorvastatin 20mg", dose: "1 tab", route: "Oral", frequency: "OD", duration: "30 days", instructions: "At night" },
    ],
    generalInstructions: "Diet control, walk 30 min daily.", followUpDate: "2024-09-20",
    fee: 800, discount: 10, discountType: "percent", netTotal: 720,
    paymentStatus: "paid", paymentMode: "Cash", amountReceived: 720, balance: 0, status: "open",
  },
  {
    id: 3, encId: "IPD-2024-0001", patientId: 3, type: "IPD", doctorId: 3, date: "2024-08-18T11:00:00",
    ward: "General Ward M", bedNo: "GWM-01", admissionType: "Emergency", priority: "Urgent",
    chiefComplaint: "Chest pain radiating to left arm", history: "Hypertensive for 10 years.",
    onExamination: "BP elevated, ECG shows ST changes.", diagnosis: "Essential hypertension",
    clinicalNotes: "Admitted for observation and cardiac workup.",
    vitals: emptyVitals("160/100", "96", "99.1", "78", "95", "140"),
    prescription: [
      { medicine: "Amlodipine 5mg", dose: "1 tab", route: "Oral", frequency: "OD", duration: "Ongoing", instructions: "Morning" },
      { medicine: "Losartan 50mg", dose: "1 tab", route: "Oral", frequency: "OD", duration: "Ongoing", instructions: "Morning" },
    ],
    generalInstructions: "Bed rest, low salt diet.", followUpDate: undefined,
    fee: 1500, discount: 0, discountType: "flat", netTotal: 1500,
    paymentStatus: "partial", paymentMode: "Insurance", amountReceived: 1000, balance: 500, status: "open",
  },
  {
    id: 4, encId: "OPD-2024-0003", patientId: 6, type: "OPD", doctorId: 2, date: "2024-08-19T10:00:00",
    tokenNo: 5, priority: "Normal",
    chiefComplaint: "Runny nose, cough, mild fever", history: "Started 2 days ago.",
    onExamination: "Throat mildly congested, chest clear.", diagnosis: "URTI",
    vitals: emptyVitals("110/70", "80", "99.2", "58", "98", "-"),
    prescription: [
      { medicine: "Panadol 500mg", dose: "1 tab", route: "Oral", frequency: "TDS", duration: "3 days", instructions: "After meals" },
    ],
    generalInstructions: "Steam inhalation twice daily.", followUpDate: undefined,
    fee: 800, discount: 0, discountType: "flat", netTotal: 800,
    paymentStatus: "unpaid", paymentMode: "Cash", amountReceived: 0, balance: 800, status: "open",
  },
  {
    id: 5, encId: "OPD-2024-0004", patientId: 8, type: "OPD", doctorId: 4, date: "2024-08-19T11:30:00",
    tokenNo: 6, priority: "Normal",
    chiefComplaint: "Loose motions and vomiting since morning", history: "Ate outside food yesterday.",
    onExamination: "Mild dehydration, abdomen soft.", diagnosis: "Gastroenteritis",
    vitals: emptyVitals("100/70", "88", "99.8", "60", "97", "-"),
    prescription: [
      { medicine: "ORS Sachets", dose: "1 sachet", route: "Oral", frequency: "As directed", duration: "3 days", instructions: "In 1L water" },
      { medicine: "Domperidone 10mg", dose: "1 tab", route: "Oral", frequency: "TDS", duration: "3 days", instructions: "Before meals" },
    ],
    generalInstructions: "Avoid oily food.", followUpDate: undefined,
    fee: 1200, discount: 0, discountType: "flat", netTotal: 1200,
    paymentStatus: "paid", paymentMode: "Card", amountReceived: 1200, balance: 0, status: "open",
  },
  {
    id: 6, encId: "OPD-2024-0005", patientId: 11, type: "OPD", doctorId: 2, date: "2024-08-21T09:00:00",
    tokenNo: 1, priority: "Urgent",
    chiefComplaint: "High grade fever, body aches for 4 days", history: "No travel history.",
    onExamination: "Rash present on trunk, tourniquet test pending.", diagnosis: "Dengue fever suspected",
    vitals: emptyVitals("110/75", "94", "102.3", "74", "96", "-"),
    prescription: [
      { medicine: "Panadol 500mg", dose: "1 tab", route: "Oral", frequency: "QDS", duration: "5 days", instructions: "Avoid NSAIDs" },
    ],
    generalInstructions: "Increase fluid intake, monitor platelets.", followUpDate: "2024-08-24",
    fee: 800, discount: 0, discountType: "flat", netTotal: 800,
    paymentStatus: "paid", paymentMode: "Cash", amountReceived: 800, balance: 0, status: "open",
  },
  {
    id: 7, encId: "OPD-2024-0006", patientId: 12, type: "OPD", doctorId: 4, date: "2024-08-21T10:30:00",
    tokenNo: 3, priority: "Normal",
    chiefComplaint: "Fatigue and pale skin", history: "Heavy menstrual bleeding reported.",
    onExamination: "Conjunctival pallor noted.", diagnosis: "Iron deficiency anaemia",
    vitals: emptyVitals("105/68", "90", "98.4", "56", "97", "-"),
    prescription: [
      { medicine: "Iron 150mg", dose: "1 tab", route: "Oral", frequency: "OD", duration: "60 days", instructions: "After meals" },
      { medicine: "Folic Acid 5mg", dose: "1 tab", route: "Oral", frequency: "OD", duration: "60 days", instructions: "Morning" },
    ],
    generalInstructions: "Iron rich diet.", followUpDate: "2024-10-21",
    fee: 1200, discount: 0, discountType: "flat", netTotal: 1200,
    paymentStatus: "partial", paymentMode: "Cash", amountReceived: 600, balance: 600, status: "open",
  },
  {
    id: 8, encId: "IPD-2024-0002", patientId: 9, type: "IPD", doctorId: 2, date: "2024-08-15T08:00:00",
    ward: "Private Rooms", bedNo: "PVT-01", admissionType: "Emergency", priority: "Urgent",
    chiefComplaint: "Cough with breathlessness, fever", history: "Symptoms for 5 days, worsening.",
    onExamination: "Crepitations right lower lobe, SpO2 91% on room air.", diagnosis: "Pneumonia",
    clinicalNotes: "Started on IV antibiotics, oxygen support.",
    vitals: emptyVitals("115/75", "102", "101.6", "68", "91", "-"),
    prescription: [
      { medicine: "Zithromax 250mg", dose: "2 tabs", route: "Oral", frequency: "OD", duration: "5 days", instructions: "Day 1 loading dose" },
      { medicine: "Dexamethasone Inj", dose: "1 amp", route: "IV", frequency: "OD", duration: "3 days", instructions: "-" },
    ],
    generalInstructions: "Oxygen support, chest physiotherapy.", followUpDate: undefined,
    fee: 800, discount: 0, discountType: "flat", netTotal: 800,
    paymentStatus: "unpaid", paymentMode: "Cash", amountReceived: 0, balance: 800, status: "discharged",
    dischargeDate: "2024-08-20", dischargeDiagnosis: "Community acquired pneumonia - resolved",
    dischargeSummary: "Patient admitted with community acquired pneumonia, treated with IV antibiotics and oxygen support. Improved clinically, afebrile for 48 hours prior to discharge.",
    conditionOnDischarge: "Improved",
  },
  {
    id: 9, encId: "OPD-2024-0007", patientId: 14, type: "OPD", doctorId: 2, date: "2024-08-22T14:00:00",
    tokenNo: 2, priority: "Normal",
    chiefComplaint: "Recurrent headache, one-sided", history: "Episodes 2-3 times a month, aura present.",
    onExamination: "No focal neurological deficit.", diagnosis: "Migraine",
    vitals: emptyVitals("118/76", "78", "98.2", "54", "98", "-"),
    prescription: [
      { medicine: "Brufen 400mg", dose: "1 tab", route: "Oral", frequency: "SOS", duration: "10 days", instructions: "At onset of headache" },
    ],
    generalInstructions: "Maintain headache diary, avoid triggers.", followUpDate: "2024-09-05",
    fee: 800, discount: 0, discountType: "flat", netTotal: 800,
    paymentStatus: "paid", paymentMode: "Cash", amountReceived: 800, balance: 0, status: "open",
  },
  {
    id: 10, encId: "OPD-2024-0008", patientId: 15, type: "OPD", doctorId: 3, date: "2024-08-22T15:00:00",
    tokenNo: 4, priority: "Normal",
    chiefComplaint: "Knee pain on walking, worse in mornings", history: "Chronic, gradually worsening over 2 years.",
    onExamination: "Crepitus on movement, mild swelling both knees.", diagnosis: "Osteoarthritis knee",
    vitals: emptyVitals("135/85", "80", "98.6", "80", "97", "-"),
    prescription: [
      { medicine: "Brufen 400mg", dose: "1 tab", route: "Oral", frequency: "BD", duration: "10 days", instructions: "After meals" },
      { medicine: "Calcium 600mg", dose: "1 tab", route: "Oral", frequency: "OD", duration: "30 days", instructions: "-" },
    ],
    generalInstructions: "Physiotherapy referral, weight management.", followUpDate: "2024-09-22",
    fee: 1500, discount: 0, discountType: "flat", netTotal: 1500,
    paymentStatus: "paid", paymentMode: "Bank Transfer", amountReceived: 1500, balance: 0, status: "open",
  },
  {
    id: 11, encId: "OPD-2024-0009", patientId: 16, type: "OPD", doctorId: 2, date: "2024-08-23T09:00:00",
    tokenNo: 7, priority: "Normal",
    chiefComplaint: "Persistent worry, difficulty sleeping", history: "Work related stress reported.",
    onExamination: "Anxious affect, no psychotic features.", diagnosis: "Anxiety disorder",
    vitals: emptyVitals("122/78", "88", "98.4", "60", "98", "-"),
    prescription: [
      { medicine: "B-Complex", dose: "1 tab", route: "Oral", frequency: "OD", duration: "30 days", instructions: "Morning" },
    ],
    generalInstructions: "Counselling referral advised, relaxation techniques.", followUpDate: "2024-09-06",
    fee: 800, discount: 0, discountType: "flat", netTotal: 800,
    paymentStatus: "paid", paymentMode: "Cash", amountReceived: 800, balance: 0, status: "open",
  },
  {
    id: 12, encId: "OPD-2024-0010", patientId: 4, type: "OPD", doctorId: 4, date: "2024-08-23T11:00:00",
    tokenNo: 8, priority: "Normal",
    chiefComplaint: "Generalised weakness and bone pain", history: "Limited sun exposure, desk job.",
    onExamination: "Tenderness over long bones.", diagnosis: "Vitamin D deficiency",
    vitals: emptyVitals("112/72", "76", "98.4", "58", "98", "-"),
    prescription: [
      { medicine: "Vit D3 50000IU", dose: "1 cap", route: "Oral", frequency: "As directed", duration: "8 weeks", instructions: "Once weekly" },
    ],
    generalInstructions: "Sun exposure 15-20 minutes daily.", followUpDate: "2024-10-18",
    fee: 1200, discount: 5, discountType: "percent", netTotal: 1140,
    paymentStatus: "paid", paymentMode: "Cash", amountReceived: 1140, balance: 0, status: "open",
  },
  {
    id: 13, encId: "OPD-2024-0011", patientId: 7, type: "OPD", doctorId: 2, date: "2024-08-24T10:00:00",
    tokenNo: 9, priority: "Normal",
    chiefComplaint: "Upper abdominal discomfort after meals", history: "Chronic intermittent symptoms.",
    onExamination: "Mild epigastric tenderness.", diagnosis: "Dyspepsia",
    vitals: emptyVitals("128/82", "74", "98.2", "72", "98", "-"),
    prescription: [
      { medicine: "Risek 20mg", dose: "1 cap", route: "Oral", frequency: "OD", duration: "14 days", instructions: "Before breakfast" },
    ],
    generalInstructions: "Avoid spicy food and caffeine.", followUpDate: undefined,
    fee: 800, discount: 0, discountType: "flat", netTotal: 800,
    paymentStatus: "unpaid", paymentMode: "Cash", amountReceived: 0, balance: 800, status: "open",
  },
  {
    id: 14, encId: "OPD-2024-0012", patientId: 20, type: "OPD", doctorId: 4, date: "2024-08-24T12:00:00",
    tokenNo: 10, priority: "Normal",
    chiefComplaint: "Burning sensation on urination, frequency", history: "Symptoms for 2 days.",
    onExamination: "Suprapubic tenderness.", diagnosis: "UTI",
    vitals: emptyVitals("116/74", "84", "99.0", "62", "98", "-"),
    prescription: [
      { medicine: "Ciprofloxacin 500mg", dose: "1 tab", route: "Oral", frequency: "BD", duration: "5 days", instructions: "After meals" },
    ],
    generalInstructions: "Increase water intake.", followUpDate: undefined,
    fee: 1200, discount: 0, discountType: "flat", netTotal: 1200,
    paymentStatus: "paid", paymentMode: "Cash", amountReceived: 1200, balance: 0, status: "open",
  },
  {
    id: 15, encId: "IPD-2024-0003", patientId: 17, type: "IPD", doctorId: 5, date: "2024-08-10T09:00:00",
    ward: "ICU", bedNo: "ICU-01", admissionType: "Emergency", priority: "Urgent",
    chiefComplaint: "Itchy red rash on both forearms, worsening", history: "Known eczema, flared after detergent exposure.",
    onExamination: "Erythematous scaly patches, excoriations present.", diagnosis: "Eczema",
    clinicalNotes: "Admitted for monitoring due to secondary infection risk in elderly patient.",
    vitals: emptyVitals("140/88", "92", "99.6", "66", "96", "-"),
    prescription: [
      { medicine: "Diclofenac Inj", dose: "1 amp", route: "IM", frequency: "SOS", duration: "3 days", instructions: "For pain" },
    ],
    generalInstructions: "Topical emollients, avoid irritants.", followUpDate: undefined,
    fee: 700, discount: 0, discountType: "flat", netTotal: 700,
    paymentStatus: "paid", paymentMode: "Insurance", amountReceived: 700, balance: 0, status: "discharged",
    dischargeDate: "2024-08-16", dischargeDiagnosis: "Eczema with secondary infection - resolved",
    dischargeSummary: "Elderly patient admitted for eczema with early secondary infection. Treated with topical and systemic therapy, improved significantly.",
    conditionOnDischarge: "Recovered",
  },
]

export const ENCOUNTERS: Encounter[] = RAW_ENCOUNTERS.map((e) => ({
  ...e,
  date: shiftDate(e.date),
  dischargeDate: shiftDate(e.dischargeDate),
  followUpDate: shiftDate(e.followUpDate),
}))

export function getEncounter(id: number): Encounter | undefined {
  return ENCOUNTERS.find((e) => e.id === id)
}

export function encountersForPatient(patientId: number): Encounter[] {
  return ENCOUNTERS.filter((e) => e.patientId === patientId)
}

export function nextEncounterId(type: "OPD" | "IPD"): string {
  const matching = ENCOUNTERS.filter((e) => e.type === type)
  const max = matching.reduce((m, e) => {
    const n = parseInt(e.encId.split("-").pop() ?? "0", 10)
    return Math.max(m, n)
  }, 0)
  return `${type}-2024-${String(max + 1).padStart(4, "0")}`
}

/** Next queue token for today — desktop's "Token No" is a daily walk-in queue number, distinct from the OPD/IPD No. */
export function nextTokenNo(): number {
  const today = new Date().toDateString()
  const todays = ENCOUNTERS.filter((e) => new Date(e.date).toDateString() === today)
  return todays.length > 0 ? Math.max(...todays.map((e) => e.tokenNo ?? 0)) + 1 : 1
}
