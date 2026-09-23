import { Navigate, Route, Routes } from "react-router-dom"

import { AuthProvider } from "@/lib/auth"
import { ProtectedRoute } from "@/components/layout/ProtectedRoute"
import { RoleGate } from "@/components/layout/RoleGate"
import { LoginPage } from "@/pages/auth/LoginPage"
import { UserProfilePage } from "@/pages/auth/UserProfilePage"
import { ComingSoon } from "@/pages/ComingSoon"
import { LandingPage } from "@/pages/public/LandingPage"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { DashboardStatsPage } from "@/pages/dashboard/DashboardStatsPage"

import { PatientListPage } from "@/pages/patients/PatientListPage"
import { PatientFormPage } from "@/pages/patients/PatientFormPage"
import { PatientProfilePage } from "@/pages/patients/PatientProfilePage"

import { EncounterListPage } from "@/pages/encounters/EncounterListPage"
import { EncounterFormPage } from "@/pages/encounters/EncounterFormPage"
import { EncounterDetailPage } from "@/pages/encounters/EncounterDetailPage"
import { DischargeSummaryPage } from "@/pages/encounters/DischargeSummaryPage"

import { BillingHubPage } from "@/pages/billing/BillingHubPage"
import { ConsultationFormPage } from "@/pages/billing/ConsultationFormPage"
import { ServicesInvoiceFormPage } from "@/pages/billing/ServicesInvoiceFormPage"

import { LabOrderListPage } from "@/pages/lab/LabOrderListPage"
import { LabOrderFormPage } from "@/pages/lab/LabOrderFormPage"
import { LabOrderDetailPage } from "@/pages/lab/LabOrderDetailPage"
import { LabResultEntryPage } from "@/pages/lab/LabResultEntryPage"

import { ImagingOrderListPage } from "@/pages/imaging/ImagingOrderListPage"
import { ImagingOrderFormPage } from "@/pages/imaging/ImagingOrderFormPage"
import { ImagingOrderDetailPage } from "@/pages/imaging/ImagingOrderDetailPage"

import { PharmacyPage } from "@/pages/pharmacy/PharmacyPage"

import { UserManagementPage } from "@/pages/admin/UserManagementPage"
import { DoctorsPage } from "@/pages/admin/DoctorsPage"
import { MasterDataPage } from "@/pages/admin/MasterDataPage"

import { ReportsPage } from "@/pages/reports/ReportsPage"

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ComingSoon title="Forgot Password" />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<UserProfilePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/stats" element={<DashboardStatsPage />} />

          <Route path="/patients" element={<PatientListPage />} />
          <Route path="/patients/new" element={<PatientFormPage mode="create" />} />
          <Route path="/patients/:id" element={<PatientProfilePage />} />
          <Route path="/patients/:id/edit" element={<PatientFormPage mode="edit" />} />

          <Route path="/encounters" element={<EncounterListPage />} />
          <Route path="/encounters/new" element={<EncounterFormPage />} />
          <Route path="/encounters/:id" element={<EncounterDetailPage />} />
          <Route path="/encounters/:id/discharge" element={<DischargeSummaryPage />} />

          <Route path="/billing" element={<Navigate to="/billing/consultations" replace />} />
          <Route path="/billing/:tab" element={<BillingHubPage />} />
          <Route path="/billing/consultations/new" element={<ConsultationFormPage />} />
          <Route path="/billing/services/new" element={<ServicesInvoiceFormPage />} />

          <Route path="/lab/orders" element={<LabOrderListPage />} />
          <Route path="/lab/orders/new" element={<LabOrderFormPage />} />
          <Route path="/lab/orders/:id" element={<LabOrderDetailPage />} />
          <Route path="/lab/orders/:id/results" element={<LabResultEntryPage />} />

          <Route path="/imaging/orders" element={<ImagingOrderListPage />} />
          <Route path="/imaging/orders/new" element={<ImagingOrderFormPage />} />
          <Route path="/imaging/orders/:id" element={<ImagingOrderDetailPage />} />

          <Route path="/pharmacy" element={<Navigate to="/pharmacy/inventory" replace />} />
          <Route path="/pharmacy/:tab" element={<PharmacyPage />} />

          <Route
            path="/admin/users"
            element={
              <RoleGate allow={["admin"]}>
                <UserManagementPage />
              </RoleGate>
            }
          />
          <Route
            path="/admin/doctors"
            element={
              <RoleGate allow={["admin"]}>
                <DoctorsPage />
              </RoleGate>
            }
          />
          <Route
            path="/admin/master-data"
            element={
              <RoleGate allow={["admin"]}>
                <MasterDataPage />
              </RoleGate>
            }
          />

          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/appointments" element={<ComingSoon title="Appointments — Phase 2" />} />
        </Route>

        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<ComingSoon title="404 — Page Not Found" />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
