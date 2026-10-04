import type { Disease } from "@/types"

export const DISEASES: Disease[] = [
  { id: 1, icdCode: "J02.9", name: "Acute pharyngitis", category: "Respiratory" },
  { id: 2, icdCode: "E11.9", name: "Type 2 diabetes mellitus (follow-up)", category: "Endocrine" },
  { id: 3, icdCode: "I10", name: "Essential hypertension", category: "Cardiovascular" },
  { id: 4, icdCode: "J06.9", name: "Upper respiratory tract infection (URTI)", category: "Respiratory" },
  { id: 5, icdCode: "K52.9", name: "Gastroenteritis", category: "Gastrointestinal" },
  { id: 6, icdCode: "A90", name: "Dengue fever (suspected)", category: "Infectious" },
  { id: 7, icdCode: "D50.9", name: "Iron deficiency anaemia", category: "Haematology" },
  { id: 8, icdCode: "J18.9", name: "Pneumonia", category: "Respiratory" },
  { id: 9, icdCode: "G43.9", name: "Migraine", category: "Neurology" },
  { id: 10, icdCode: "M17.9", name: "Osteoarthritis, knee", category: "Musculoskeletal" },
  { id: 11, icdCode: "F41.9", name: "Anxiety disorder", category: "Psychiatric" },
  { id: 12, icdCode: "E55.9", name: "Vitamin D deficiency", category: "Endocrine" },
  { id: 13, icdCode: "K30", name: "Dyspepsia", category: "Gastrointestinal" },
  { id: 14, icdCode: "N39.0", name: "Urinary tract infection (UTI)", category: "Genitourinary" },
  { id: 15, icdCode: "L30.9", name: "Eczema", category: "Dermatology" },
  { id: 16, icdCode: "J45.9", name: "Asthma", category: "Respiratory" },
  { id: 17, icdCode: "E78.5", name: "Hyperlipidaemia", category: "Endocrine" },
  { id: 18, icdCode: "M54.5", name: "Low back pain", category: "Musculoskeletal" },
  { id: 19, icdCode: "R51", name: "Headache, unspecified", category: "Neurology" },
  { id: 20, icdCode: "B34.9", name: "Viral infection, unspecified", category: "Infectious" },
]

export function getDisease(id: number): Disease | undefined {
  return DISEASES.find((d) => d.id === id)
}
