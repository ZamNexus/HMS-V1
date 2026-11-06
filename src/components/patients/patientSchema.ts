import { z } from "zod"

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
