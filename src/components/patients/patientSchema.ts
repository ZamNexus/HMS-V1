import { z } from "zod"
import { CNIC_RE, PATIENT_LIMITS, PHONE_RE } from "@/lib/services/http/patientMap"

// Patient form validation (moved verbatim from PatientForm.tsx so it can be unit-tested).
// Client-side only: the backend's own validation (VALIDATION_FAILED + details) is shown when it rejects a save.
export const patientSchema = z.object({
  medicalRecordNo: z.string().optional(),
  ssEmpNo: z.string().optional(),
  name: z.string().min(2, "Full name must be at least 2 characters"),
  fatherName: z.string().optional(),
  dob: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["Male", "Female", "Other"]),
  cnic: z.string().optional(),
  bloodGroup: z.string().min(1),
  phone: z.string().regex(/^03\d{2}-\d{7}$/, "Format: 03XX-XXXXXXX"),
  emergencyContact: z.string().optional(),
  email: z.string().email("Enter a valid email address").optional().or(z.literal("")),
  address: z.string().optional(),
  area: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  guardianRelation: z.string().optional(),
  guardianName: z.string().optional(),
  panelId: z.string().optional(),
  referredBy: z.string().optional(),
  remarks: z.string().max(500).optional(),
  active: z.boolean().optional(),
})
export type PatientFormValues = z.infer<typeof patientSchema>

// ── Against the real API: the rules the contract states (docs/openapi.json CreatePatientDto), not the demo's Pakistan-mobile-only phone format ──
const optionalMax = (max: number, label: string) => z.string().max(max, `${label} can be at most ${max} characters`).optional()
const phoneRule = (label: string) =>
  z.string().trim()
    .min(PATIENT_LIMITS.phoneMin, `${label} needs at least ${PATIENT_LIMITS.phoneMin} characters`)
    .max(PATIENT_LIMITS.phoneMax, `${label} can be at most ${PATIENT_LIMITS.phoneMax} characters`)
    .regex(PHONE_RE, `${label}: digits, spaces and + ( ) . / - only`)

export const apiPatientSchema = patientSchema.extend({
  name: z.string().trim().min(2, "Full name must be at least 2 characters"),
  fatherName: optionalMax(PATIENT_LIMITS.fatherName, "Father/husband name"),
  // the date of birth or the estimated age is checked by the form itself (exactly one of the two)
  dob: z.string().optional(),
  cnic: z.string().trim().regex(CNIC_RE, "13 digits, for example 12345-1234567-1").optional().or(z.literal("")),
  phone: phoneRule("Primary phone"),
  emergencyContact: phoneRule("Emergency contact").optional().or(z.literal("")),
  address: optionalMax(PATIENT_LIMITS.address, "Address"),
  area: optionalMax(PATIENT_LIMITS.area, "Area"),
  city: optionalMax(PATIENT_LIMITS.city, "City"),
  guardianName: optionalMax(PATIENT_LIMITS.guardianName, "Guardian name"),
  referredBy: optionalMax(PATIENT_LIMITS.referredBy, "Referred by"),
  medicalRecordNo: optionalMax(PATIENT_LIMITS.medicalRecordNo, "Old medical record number"),
  remarks: optionalMax(PATIENT_LIMITS.remarks, "Remarks"),
})
