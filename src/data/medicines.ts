import type { Medicine } from "@/types"

export const MEDICINES: Medicine[] = [
  { id: 1, name: "Augmentin 625mg", generic: "Amoxicillin + Clavulanate", category: "Antibiotic", batchNo: "AUG-2401", expiry: "2026-05-31", stock: 240, unit: "Tablet", purchaseRate: 18, saleRate: 28, reorderLevel: 30, supplier: "GSK Pakistan" },
  { id: 2, name: "Panadol 500mg", generic: "Paracetamol", category: "Analgesic", batchNo: "PAN-2402", expiry: "2027-01-31", stock: 500, unit: "Tablet", purchaseRate: 2, saleRate: 4, reorderLevel: 50, supplier: "GSK Pakistan" },
  { id: 3, name: "Brufen 400mg", generic: "Ibuprofen", category: "NSAID", batchNo: "BRU-2403", expiry: "2026-11-30", stock: 180, unit: "Tablet", purchaseRate: 3, saleRate: 6, reorderLevel: 30, supplier: "Abbott" },
  { id: 4, name: "Amoxil 500mg", generic: "Amoxicillin", category: "Antibiotic", batchNo: "AMX-2312", expiry: "2025-12-31", stock: 8, unit: "Capsule", purchaseRate: 5, saleRate: 9, reorderLevel: 30, supplier: "GSK Pakistan" },
  { id: 5, name: "Risek 20mg", generic: "Omeprazole", category: "PPI", batchNo: "RIS-2404", expiry: "2026-08-31", stock: 300, unit: "Capsule", purchaseRate: 6, saleRate: 11, reorderLevel: 40, supplier: "Getz Pharma" },
  { id: 6, name: "Ventolin Inhaler", generic: "Salbutamol", category: "Bronchodilator", batchNo: "VNT-2312", expiry: "2025-10-31", stock: 15, unit: "Inhaler", purchaseRate: 220, saleRate: 320, reorderLevel: 20, supplier: "GSK Pakistan" },
  { id: 7, name: "Metformin 500mg", generic: "Metformin HCl", category: "Antidiabetic", batchNo: "MET-2405", expiry: "2026-09-30", stock: 400, unit: "Tablet", purchaseRate: 2, saleRate: 4, reorderLevel: 50, supplier: "Searle" },
  { id: 8, name: "Amlodipine 5mg", generic: "Amlodipine Besylate", category: "Antihypertensive", batchNo: "AML-2406", expiry: "2026-07-31", stock: 250, unit: "Tablet", purchaseRate: 3, saleRate: 5, reorderLevel: 40, supplier: "Searle" },
  { id: 9, name: "Flagyl 400mg", generic: "Metronidazole", category: "Antibiotic", batchNo: "FLG-2407", expiry: "2026-04-30", stock: 120, unit: "Tablet", purchaseRate: 3, saleRate: 6, reorderLevel: 30, supplier: "Sanofi" },
  { id: 10, name: "Nexium 40mg", generic: "Esomeprazole", category: "PPI", batchNo: "NEX-2408", expiry: "2026-12-31", stock: 90, unit: "Tablet", purchaseRate: 15, saleRate: 24, reorderLevel: 25, supplier: "AstraZeneca" },
  { id: 11, name: "Ciprofloxacin 500mg", generic: "Ciprofloxacin", category: "Antibiotic", batchNo: "CIP-2409", expiry: "2026-06-30", stock: 200, unit: "Tablet", purchaseRate: 4, saleRate: 7, reorderLevel: 30, supplier: "Bayer" },
  { id: 12, name: "Zithromax 250mg", generic: "Azithromycin", category: "Antibiotic", batchNo: "ZTH-2312", expiry: "2025-11-30", stock: 60, unit: "Tablet", purchaseRate: 25, saleRate: 40, reorderLevel: 25, supplier: "Pfizer" },
  { id: 13, name: "Atorvastatin 20mg", generic: "Atorvastatin Calcium", category: "Antihypertensive", batchNo: "ATV-2410", expiry: "2026-10-31", stock: 180, unit: "Tablet", purchaseRate: 6, saleRate: 10, reorderLevel: 30, supplier: "Pfizer" },
  { id: 14, name: "Losartan 50mg", generic: "Losartan Potassium", category: "Antihypertensive", batchNo: "LOS-2411", expiry: "2026-03-31", stock: 220, unit: "Tablet", purchaseRate: 5, saleRate: 8, reorderLevel: 35, supplier: "Getz Pharma" },
  { id: 15, name: "Glucophage 1000mg", generic: "Metformin HCl", category: "Antidiabetic", batchNo: "GLU-2412", expiry: "2026-08-31", stock: 150, unit: "Tablet", purchaseRate: 4, saleRate: 7, reorderLevel: 30, supplier: "Merck" },
  { id: 16, name: "ORS Sachets", generic: "Oral Rehydration Salts", category: "Other", batchNo: "ORS-2312", expiry: "2025-09-30", stock: 3, unit: "Sachet", purchaseRate: 8, saleRate: 15, reorderLevel: 40, supplier: "Local" },
  { id: 17, name: "Paracetamol Syrup 120mg", generic: "Paracetamol", category: "Analgesic", batchNo: "PCS-2311", expiry: "2025-08-31", stock: 5, unit: "Syrup", purchaseRate: 40, saleRate: 65, reorderLevel: 20, supplier: "GSK Pakistan" },
  { id: 18, name: "Calpol Drops", generic: "Paracetamol", category: "Analgesic", batchNo: "CPD-2401", expiry: "2026-02-28", stock: 45, unit: "Drops", purchaseRate: 55, saleRate: 85, reorderLevel: 15, supplier: "GSK Pakistan" },
  { id: 19, name: "Disprin 300mg", generic: "Aspirin", category: "Analgesic", batchNo: "DIS-2402", expiry: "2026-06-30", stock: 300, unit: "Tablet", purchaseRate: 1, saleRate: 3, reorderLevel: 40, supplier: "Reckitt" },
  { id: 20, name: "Vit C 500mg", generic: "Ascorbic Acid", category: "Vitamin/Supplement", batchNo: "VTC-2403", expiry: "2026-11-30", stock: 400, unit: "Tablet", purchaseRate: 2, saleRate: 4, reorderLevel: 40, supplier: "Herbion" },
  { id: 21, name: "Folic Acid 5mg", generic: "Folic Acid", category: "Vitamin/Supplement", batchNo: "FOL-2404", expiry: "2026-12-31", stock: 350, unit: "Tablet", purchaseRate: 1, saleRate: 3, reorderLevel: 40, supplier: "Local" },
  { id: 22, name: "Iron 150mg", generic: "Ferrous Sulphate", category: "Vitamin/Supplement", batchNo: "IRN-2405", expiry: "2026-09-30", stock: 200, unit: "Tablet", purchaseRate: 2, saleRate: 4, reorderLevel: 30, supplier: "Local" },
  { id: 23, name: "Calcium 600mg", generic: "Calcium Carbonate", category: "Vitamin/Supplement", batchNo: "CAL-2406", expiry: "2026-10-31", stock: 180, unit: "Tablet", purchaseRate: 3, saleRate: 6, reorderLevel: 30, supplier: "Getz Pharma" },
  { id: 24, name: "Vit D3 50000IU", generic: "Cholecalciferol", category: "Vitamin/Supplement", batchNo: "VTD-2407", expiry: "2026-07-31", stock: 120, unit: "Capsule", purchaseRate: 20, saleRate: 35, reorderLevel: 20, supplier: "Getz Pharma" },
  { id: 25, name: "B-Complex", generic: "Vitamin B Complex", category: "Vitamin/Supplement", batchNo: "BCX-2408", expiry: "2026-05-31", stock: 250, unit: "Tablet", purchaseRate: 2, saleRate: 5, reorderLevel: 35, supplier: "Local" },
  { id: 26, name: "Dexamethasone Inj", generic: "Dexamethasone", category: "Steroid", batchNo: "DEX-2312", expiry: "2025-10-31", stock: 30, unit: "Injection", purchaseRate: 15, saleRate: 25, reorderLevel: 15, supplier: "Local" },
  { id: 27, name: "Tramadol 50mg", generic: "Tramadol HCl", category: "Analgesic", batchNo: "TRM-2409", expiry: "2026-04-30", stock: 80, unit: "Capsule", purchaseRate: 8, saleRate: 14, reorderLevel: 20, supplier: "Local" },
  { id: 28, name: "Diclofenac Inj", generic: "Diclofenac Sodium", category: "NSAID", batchNo: "DIC-2401", expiry: "2026-01-31", stock: 25, unit: "Injection", purchaseRate: 12, saleRate: 20, reorderLevel: 20, supplier: "Local" },
  { id: 29, name: "Ranitidine 150mg", generic: "Ranitidine HCl", category: "PPI", batchNo: "RAN-2402", expiry: "2026-03-31", stock: 160, unit: "Tablet", purchaseRate: 2, saleRate: 4, reorderLevel: 30, supplier: "Local" },
  { id: 30, name: "Domperidone 10mg", generic: "Domperidone", category: "Antiemetic", batchNo: "DOM-2403", expiry: "2026-06-30", stock: 130, unit: "Tablet", purchaseRate: 2, saleRate: 4, reorderLevel: 30, supplier: "Local" },
]

export function getMedicine(id: number): Medicine | undefined {
  return MEDICINES.find((m) => m.id === id)
}

export const MEDICINE_CATEGORIES = [
  "Antibiotic", "Analgesic", "Antidiabetic", "Antihypertensive", "NSAID", "PPI",
  "Bronchodilator", "Vitamin/Supplement", "Antiemetic", "Antifungal", "Steroid",
  "Injection", "Other",
]
