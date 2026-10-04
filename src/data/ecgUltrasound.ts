import type { EcgUltrasoundTest } from "@/types"

export const ECG_ULTRASOUND_TESTS: EcgUltrasoundTest[] = [
  { id: 1, code: "ECG-01", name: "ECG (Electrocardiogram)", fee: 500, active: true },
  { id: 2, code: "USG-01", name: "Ultrasound Abdomen", fee: 2500, active: true },
  { id: 3, code: "USG-02", name: "Ultrasound Pelvis", fee: 2000, active: true },
  { id: 4, code: "ECHO-01", name: "Echocardiography", fee: 3500, active: true },
  { id: 5, code: "USG-03", name: "Doppler Study", fee: 2800, active: true },
  { id: 6, code: "USG-04", name: "Obstetric Ultrasound (Pregnancy)", fee: 2200, active: true },
]

export function getEcgUltrasoundTest(id: number): EcgUltrasoundTest | undefined {
  return ECG_ULTRASOUND_TESTS.find((t) => t.id === id)
}
