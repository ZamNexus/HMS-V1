import type { User } from "@/types"

export const USERS: User[] = [
  { id: 1, name: "Dr. Ahmed Raza", email: "admin@citiclinic.pk", password: "admin123", role: "admin", spec: null, fee: null, avatar: "AR", phone: "0300-1234567", active: true, lastLogin: "2 hours ago", joiningDate: "2020-01-05" },
  { id: 2, name: "Dr. Sarah Khan", email: "doctor@citiclinic.pk", password: "doctor123", role: "doctor", spec: "General Physician", fee: 800, avatar: "SK", phone: "0321-1234567", active: true, lastLogin: "35 minutes ago", joiningDate: "2021-03-14" },
  { id: 3, name: "Dr. Imran Siddiqui", email: "doctor2@citiclinic.pk", password: "doctor123", role: "doctor", spec: "Cardiologist", fee: 1500, avatar: "IS", phone: "0333-9876543", active: true, lastLogin: "Yesterday", joiningDate: "2019-11-02" },
  { id: 4, name: "Dr. Nadia Rehman", email: "doctor3@citiclinic.pk", password: "doctor123", role: "doctor", spec: "Gynaecologist", fee: 1200, avatar: "NR", phone: "0311-5678901", active: true, lastLogin: "3 days ago", joiningDate: "2022-06-20" },
  { id: 5, name: "Dr. Aamir Raza", email: "doctor4@citiclinic.pk", password: "doctor123", role: "doctor", spec: "Paediatrician", fee: 700, avatar: "AR", phone: "0345-2345678", active: true, lastLogin: "1 day ago", joiningDate: "2020-09-11" },
  { id: 6, name: "Fatima Malik", email: "receptionist@citiclinic.pk", password: "recep123", role: "receptionist", spec: null, fee: null, avatar: "FM", phone: "0301-1112223", active: true, lastLogin: "10 minutes ago", joiningDate: "2023-02-01" },
  { id: 7, name: "Ali Hassan", email: "billing@citiclinic.pk", password: "billing123", role: "billing", spec: null, fee: null, avatar: "AH", phone: "0302-2223334", active: true, lastLogin: "1 hour ago", joiningDate: "2022-08-15" },
  { id: 8, name: "Zara Ahmed", email: "lab@citiclinic.pk", password: "lab123", role: "lab_tech", spec: null, fee: null, avatar: "ZA", phone: "0303-3334445", active: true, lastLogin: "20 minutes ago", joiningDate: "2021-12-01" },
  { id: 9, name: "Omar Farooq", email: "pharmacy@citiclinic.pk", password: "pharma123", role: "pharmacist", spec: null, fee: null, avatar: "OF", phone: "0304-4445556", active: true, lastLogin: "5 hours ago", joiningDate: "2023-05-10" },
  { id: 10, name: "Nurse Hina Baig", email: "nurse@citiclinic.pk", password: "nurse123", role: "nurse", spec: null, fee: null, avatar: "HB", phone: "0305-5556667", active: true, lastLogin: "2 days ago", joiningDate: "2022-01-19" },
]

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
