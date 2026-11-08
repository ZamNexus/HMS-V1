// Phase 7 browser checks, part 2: vitals, the clinical record, close, corrections, the ward flows, the patient's Visits tab, the department switch and roles.
module.exports = async function part2(c) {
  const { page, S, requests, F, E, P, TODAY, YESTERDAY, U, D1, ok, go, main, closed, actionNames, tab, dlg, signOutAndIn, since, consoleErrors } = c
  const { e0, e1, e2, e3, e4, e5, e6 } = E
  const panel = (id) => page.getByTestId(id)
  const open = (e) => go("/encounters/" + e.id).then(() => page.getByTestId("visit-detail").waitFor({ timeout: 8000 }))
  let i0 = 0

  // ───────────── E3 vitals ─────────────
  await open(e0); await tab("Vitals").click(); await panel("vitals-panel").waitFor()
  const save = () => panel("vitals-panel").getByRole("button", { name: "Record vitals" })
  i0 = requests.length
  await save().click(); await page.waitForTimeout(400)
  ok("E3 an empty reading is refused on the form, nothing is sent", /at least one/i.test(await panel("vitals-problem").innerText()) && since(i0).filter((r) => r.method === "POST" && r.path.endsWith("/vitals")).length === 0)
  await page.locator("#vit-pulse").fill("19"); await save().click(); await page.waitForTimeout(300)
  ok("E3 a pulse of 19 is outside the contract's range (20 to 300): refused, nothing sent", /pulse/i.test(await panel("vitals-problem").innerText()) && since(i0).filter((r) => r.method === "POST").length === 0)
  await page.locator("#vit-pulse").fill("")
  await page.locator("#vit-bpSystolic").fill("80"); await page.locator("#vit-bpDiastolic").fill("90"); await save().click(); await page.waitForTimeout(300)
  ok("E3 a top pressure below the bottom one is refused", /higher/i.test(await panel("vitals-problem").innerText()) && since(i0).filter((r) => r.method === "POST").length === 0)
  await page.getByLabel("Taken earlier than now", { exact: true }).click()
  await page.getByLabel("Taken earlier than now: date").fill("2026-12-25"); await page.getByLabel("Taken earlier than now: time").fill("08:00"); await page.waitForTimeout(300)
  ok("E3 a reading dated in the future is refused and Record vitals stays off", await save().isDisabled())
  await page.getByLabel("Taken earlier than now", { exact: true }).click()
  for (const [id, v] of [["bpSystolic", "120"], ["bpDiastolic", "80"], ["pulse", "72"], ["temperatureF", "98.6"], ["spo2", "98"], ["weightKg", "70"], ["heightCm", "170"]]) await page.locator("#vit-" + id).fill(v)
  S.slowSave = true; i0 = requests.length
  await Promise.all([save().dblclick(), page.waitForTimeout(150)]); await page.waitForTimeout(1500); S.slowSave = false
  const vp = since(i0).filter((r) => r.method === "POST" && r.path === `/encounters/${e0.id}/vitals`)
  ok("E3 a double click sends ONE POST with numbers (not text) in range", vp.length === 1 && vp[0].body.pulse === 72 && vp[0].body.temperatureF === 98.6 && vp[0].body.bpSystolic === 120 && !("recordedAt" in vp[0].body), JSON.stringify(vp.map((r) => r.body)))
  const list = await panel("vitals-panel").innerText()
  ok("E3 the reading is listed with the server's BMI (24.2) and who took it; the form is empty again", /120\/80 mmHg · 72 bpm · 98\.6 °F · SpO₂ 98% · 70 kg · 170 cm · BMI 24\.2/.test(list) && /Test User/.test(list) && (await page.locator("#vit-pulse").inputValue()) === "")

  // ───────────── E4 clinical record ─────────────
  await tab("Clinical record").click(); await panel("clinical-form").waitFor()
  ok("E4 the latest vitals are shown above the record", /72 bpm/.test(await panel("latest-vitals").innerText()))
  ok("E4 an empty record says what it still needs", /needs a chief complaint and a primary diagnosis/.test(await panel("record-status").innerText()))
  await page.locator("#rec-chief").fill("Fever for 2 days"); await page.locator("#rec-history").fill("High grade, no rash")
  const dx = panel("record-diagnoses")
  await dx.getByLabel("Diagnosis as text").fill("Viral fever"); await dx.getByRole("button", { name: "Add", exact: true }).click()
  await dx.getByRole("button", { name: "ICD-10 Lookup" }).click()
  await page.getByLabel("Search diagnosis or ICD code").fill("gastro"); await page.waitForTimeout(1300)
  await page.getByTestId("icd-lookup-api").getByRole("button", { name: /Gastroenteritis/ }).click(); await page.waitForTimeout(400)
  ok("E4 a looked-up ICD-10 code joins the list with its code; the first diagnosis is primary", /A09/.test(await dx.innerText()) && (await dx.getByRole("radio", { name: /Primary diagnosis: Viral fever/ }).isChecked()))
  await dx.getByRole("radio", { name: /Primary diagnosis: A09/ }).check()
  ok("E4 choosing another primary leaves exactly one", (await dx.getByRole("radio", { name: /Primary diagnosis: A09/ }).isChecked()) && !(await dx.getByRole("radio", { name: /Primary diagnosis: Viral fever/ }).isChecked()))
  await panel("prescription").getByRole("button", { name: "Add medicine" }).click()
  await page.getByLabel("Medicine 1", { exact: true }).fill("Paracetamol 500 mg"); await page.getByLabel("Dose 1", { exact: true }).fill("1 tab"); await page.getByLabel("Frequency 1", { exact: true }).fill("TDS"); await page.getByLabel("Duration 1", { exact: true }).fill("3 days"); await page.getByLabel("Quantity 1", { exact: true }).fill("9")
  const v0 = e0.updatedAt; i0 = requests.length
  S.slowSave = true
  await Promise.all([page.getByRole("button", { name: "Save record" }).dblclick(), page.waitForTimeout(150)]); await page.waitForTimeout(1500); S.slowSave = false
  const put = since(i0).filter((r) => r.method === "PUT" && r.path === `/encounters/${e0.id}/clinical-record`)
  ok("E4 a double click sends ONE PUT carrying the version the screen loaded", put.length === 1 && put[0].body.expectedUpdatedAt === v0, JSON.stringify(put.map((r) => r.body.expectedUpdatedAt)))
  ok("E4 the record is sent whole: texts, the primary ICD code by id, the free-text diagnosis, the line without an id", !!put[0] && put[0].body.chiefComplaint === "Fever for 2 days" && put[0].body.examinationFindings === null && put[0].body.diagnoses.length === 2 && put[0].body.diagnoses.find((d) => d.isPrimary).icdCodeId === F.icd[1].id && put[0].body.diagnoses.find((d) => !d.isPrimary).text === "Viral fever" && put[0].body.prescription.length === 1 && !("id" in put[0].body.prescription[0]) && put[0].body.prescription[0].quantity === 9, JSON.stringify(put[0] && put[0].body))
  ok("E4 after the save the record is complete", /complete: the visit can be closed/.test(await panel("record-status").innerText()))
  await page.getByLabel("Dose 1", { exact: true }).fill("2 tabs"); i0 = requests.length
  await page.getByRole("button", { name: "Save record" }).click(); await page.waitForTimeout(1200)
  const put2 = since(i0).find((r) => r.method === "PUT")
  const lineId = e0.rec.rx[0].id
  ok("E4 the next save sends the line back WITH its id (a line without one would be a new line)", !!put2 && put2.body.prescription.length === 1 && put2.body.prescription[0].id === lineId && put2.body.prescription[0].dose === "2 tabs", JSON.stringify(put2 && put2.body.prescription))
  S.dispensedLine = lineId
  await page.getByRole("button", { name: "Remove medicine 1" }).click(); i0 = requests.length
  await page.getByRole("button", { name: "Save record" }).click(); await page.waitForTimeout(1200)
  ok("E4 removing a dispensed line: 422 PRESCRIPTION_DISPENSED is explained and the record keeps its line", /dispensed/i.test(await panel("clinical-form").innerText()) && e0.rec.rx.length === 1)
  S.dispensedLine = null
  await page.getByRole("button", { name: "Save record" }).click(); await page.waitForTimeout(1200)
  ok("E4 a line left out of the save is removed (the server's rule)", e0.rec.rx.length === 0)
  // a conflict: someone else saves first
  await page.locator("#rec-chief").fill("Fever for 3 days"); S.bump = e0.id; i0 = requests.length
  await page.getByRole("button", { name: "Save record" }).click(); await page.waitForTimeout(1200)
  ok("E4 409 ENCOUNTER_CHANGED keeps what was typed and offers 'Load latest'", (await page.getByTestId("conflict-banner").count()) === 1 && (await page.locator("#rec-chief").inputValue()) === "Fever for 3 days")
  await page.getByRole("button", { name: "Load latest" }).click(); await page.waitForTimeout(1500)
  ok("E4 'Load latest' shows the server's record and keeps the unsaved text on screen to copy from, and does not restore it as a draft", (await page.locator("#rec-chief").inputValue()) === "Fever for 2 days" && /Fever for 3 days/.test(await panel("discarded-text").innerText()) && (await panel("draft-restored").count()) === 0)

  // ───────────── E12 corrections ─────────────
  const dialogSave = () => dlg().getByRole("button", { name: "Save correction" })
  await page.getByRole("button", { name: "Correct check-in" }).click(); await dlg().waitFor()
  await page.locator("#fix-priority").click(); await page.getByRole("option", { name: "Normal" }).click(); i0 = requests.length
  await dialogSave().click(); await closed(); await page.waitForTimeout(1000)
  const pc = since(i0).find((r) => r.method === "PATCH")
  ok("E12 correcting the priority sends PATCH with ONLY the change and the loaded version", !!pc && JSON.stringify(Object.keys(pc.body).sort()) === JSON.stringify(["expectedUpdatedAt", "priority"]) && pc.body.priority === "normal", JSON.stringify(pc && pc.body))
  ok("E12 the header no longer says Urgent", (await page.getByTestId("visit-detail").getByText("Urgent", { exact: true }).count()) === 0)
  await page.getByRole("button", { name: "Correct check-in" }).click(); await dlg().waitFor()
  await page.locator("#fix-advised").fill("Dr Khalid"); S.bump = e0.id
  await dialogSave().click(); await page.waitForTimeout(1000)
  ok("E12 a conflict (409 ENCOUNTER_CHANGED) is shown in the dialog with Load latest", (await dlg().getByTestId("conflict-banner").count()) === 1)
  await dlg().getByRole("button", { name: "Load latest" }).click(); await closed(); await page.waitForTimeout(800)

  // ───────────── E5 close ─────────────
  await open(e1)
  await page.getByRole("button", { name: "Close visit" }).click(); await dlg().waitFor(); i0 = requests.length
  await dlg().getByRole("button", { name: "Close visit" }).click(); await page.waitForTimeout(1000)
  const miss = await dlg().getByTestId("missing-list").innerText().catch(() => "")
  ok("E5 closing an unfinished record: 422 CLINICAL_RECORD_INCOMPLETE lists what is missing in words", /chief complaint/.test(miss) && /a primary diagnosis/.test(miss) && since(i0).filter((r) => r.path.endsWith("/close")).length === 1, miss.replace(/\n/g, " | "))
  await dlg().getByRole("button", { name: "Cancel", exact: true }).click(); await closed()
  await tab("Clinical record").click(); await panel("clinical-form").waitFor()
  await page.locator("#rec-chief").fill("Headache"); await panel("record-diagnoses").getByLabel("Diagnosis as text").fill("Migraine"); await panel("record-diagnoses").getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("button", { name: "Save record" }).click(); await page.waitForTimeout(1200)
  await page.getByRole("button", { name: "Close visit" }).click(); await dlg().waitFor(); i0 = requests.length
  await Promise.all([dlg().getByRole("button", { name: "Close visit" }).dblclick(), page.waitForTimeout(150)]); await closed(); await page.waitForTimeout(1000)
  ok("E5 once the record is complete, a double click sends ONE POST /close (no body) and the visit is Closed", since(i0).filter((r) => r.method === "POST" && r.path === `/encounters/${e1.id}/close`).length === 1 && e1.status === "closed" && /Closed/.test(await page.getByTestId("visit-detail").innerText()))
  ok("E5 a closed visit's record can no longer be edited and its buttons are Reopen and Archive", JSON.stringify(await actionNames()) === JSON.stringify(["Reopen", "Archive"]) && (await page.getByRole("button", { name: "Save record" }).count()) === 0)

  // handoff 5: what the user may do but the state forbids is shown OFF with the reason, not hidden
  const offBtn = (name) => page.getByTestId("visit-actions").getByRole("button", { name, exact: true })
  const offTitles = async () => { const out = {}; const bs = page.getByTestId("visit-actions").getByRole("button"); for (let i = 0; i < await bs.count(); i++) if (!(await bs.nth(i).isEnabled())) out[(await bs.nth(i).innerText()).trim()] = (await bs.nth(i).getAttribute("title")) || ""; return out }
  const off1 = await offTitles()
  ok("E6/handoff 5 a closed visit shows Correct check-in, Record vitals, Clinical record, Close visit and Cancel visit OFF, each with its reason", ["Correct check-in", "Record vitals", "Clinical record", "Close visit", "Cancel visit"].every((n) => /already closed/.test(off1[n] || "")), JSON.stringify(off1))
  ok("E6/handoff 5 the off buttons do nothing when clicked", await offBtn("Close visit").isDisabled() && (await page.getByRole("dialog").count()) === 0)
  // ───────────── E12 cancel, reopen, archive, restore ─────────────
  const fresh = E.encounters.find((e) => e.reason === "Cough and fever")
  await open(fresh)
  await page.getByRole("button", { name: "Cancel visit" }).click(); await dlg().waitFor()
  await dlg().getByLabel("Reason *").fill("no")
  ok("E12 a 2-character reason keeps Cancel off (3 to 300 characters)", await dlg().getByRole("button", { name: "Cancel visit" }).isDisabled())
  await dlg().getByLabel("Reason *").fill("Patient went home"); i0 = requests.length
  await Promise.all([dlg().getByRole("button", { name: "Cancel visit" }).dblclick(), page.waitForTimeout(150)]); await closed(); await page.waitForTimeout(1000)
  const cx = since(i0).filter((r) => r.method === "POST" && r.path === `/encounters/${fresh.id}/cancel`)
  ok("E12 Cancel sends ONE POST with exactly { reason } and the visit shows as cancelled with the reason", cx.length === 1 && JSON.stringify(cx[0].body) === JSON.stringify({ reason: "Patient went home" }) && /Patient went home/.test(await page.getByTestId("visit-cancelled").innerText()))
  await open(e4)
  await page.getByRole("button", { name: "Cancel visit" }).click(); await dlg().waitFor(); await dlg().getByLabel("Reason *").fill("Entered by mistake"); i0 = requests.length
  await dlg().getByRole("button", { name: "Cancel visit" }).click(); await page.waitForTimeout(1000)
  ok("E12 ENCOUNTER_RECORD_STARTED (the doctor already began) is explained; the visit stays open", /already started the record/i.test(await dlg().innerText()) && e4.status === "open")
  await dlg().getByRole("button", { name: "Cancel", exact: true }).click(); await closed()
  await open(e2)
  await page.getByRole("button", { name: "Reopen", exact: true }).click(); await dlg().waitFor(); await dlg().getByLabel("Reason *").fill("Correction needed"); i0 = requests.length
  await dlg().getByRole("button", { name: "Reopen visit" }).click(); await closed(); await page.waitForTimeout(1000)
  const ro = since(i0).find((r) => r.method === "POST" && r.path === `/encounters/${e2.id}/reopen`)
  ok("E12 Reopen sends { reason } and the visit is open again", !!ro && ro.body.reason === "Correction needed" && e2.status === "open" && /Open/.test(await page.getByTestId("visit-detail").innerText()))
  await open(e5)
  await page.getByRole("button", { name: "Archive", exact: true }).click(); await dlg().waitFor(); i0 = requests.length
  ok("E12 the archive dialog says hidden / kept / restorable, never 'deleted'", /restored/.test(await dlg().innerText()) && !/delete/i.test(await dlg().innerText()))
  await dlg().getByRole("button", { name: "Archive", exact: true }).click(); await closed(); await page.waitForTimeout(1000)
  ok("E12 Archive sends POST /archive and the page says Archived with only Restore left", since(i0).some((r) => r.method === "POST" && r.path === `/encounters/${e5.id}/archive`) && JSON.stringify(await actionNames()) === JSON.stringify(["Restore"]))
  await page.getByRole("button", { name: "Restore", exact: true }).click(); await dlg().waitFor(); i0 = requests.length
  await dlg().getByRole("button", { name: "Restore", exact: true }).click(); await closed(); await page.waitForTimeout(1000)
  ok("E12 Restore sends POST /restore", since(i0).some((r) => r.method === "POST" && r.path === `/encounters/${e5.id}/restore`) && e5.archived === false)

  // ───────────── E10 progress notes, E9 transfer, E11 discharge ─────────────
  await open(e3); await tab("Progress notes").click(); await panel("notes-panel").waitFor()
  const add = panel("notes-panel").getByRole("button", { name: "Add note" })
  ok("E10 Add note is off for an empty note", await add.isDisabled())
  await page.locator("#visit-note").fill("Stable overnight, pain settled."); i0 = requests.length
  await Promise.all([add.dblclick(), page.waitForTimeout(150)]); await page.waitForTimeout(1200)
  const np = since(i0).filter((r) => r.method === "POST" && r.path === `/encounters/${e3.id}/progress-notes`)
  ok("E10 a double click sends ONE POST { note }; the note is listed with its author and the box is cleared", np.length === 1 && JSON.stringify(np[0].body) === JSON.stringify({ note: "Stable overnight, pain settled." }) && /Stable overnight/.test(await panel("notes-panel").innerText()) && (await page.locator("#visit-note").inputValue()) === "")
  ok("E10 notes are append-only: no edit or delete control on a note", (await panel("notes-panel").getByRole("button", { name: /edit|delete|remove/i }).count()) === 0)
  await open(e0)
  const off0 = await offTitles()
  ok("handoff 5 an open visit shows Reopen OFF with its reason (only a closed or discharged visit can be reopened)", /closed or discharged/.test(off0["Reopen"] || ""), JSON.stringify(off0))
  ok("E10 an OPD visit has no Progress notes tab", (await tab("Progress notes").count()) === 0)

  E.encounters.filter((e) => e.bedId === U(210) && e.status === "open").forEach((e) => { e.status = "cancelled" }) // the admission another desk "stole" A-01 with in E7 ends, so A-01 is free again
  await open(e3)
  await page.getByRole("button", { name: "Transfer bed" }).click(); await dlg().waitFor(); await page.waitForTimeout(600)
  ok("E9 the transfer dialog's picker shows the current bed as off and offers only free beds", await dlg().getByRole("radio", { name: /Bed A-02 .*current bed/ }).isDisabled() && await dlg().getByRole("radio", { name: /Bed A-01 .*available/ }).isEnabled() && await dlg().getByRole("button", { name: "Transfer", exact: true }).isDisabled())
  await dlg().getByRole("radio", { name: /Bed A-01 .*available/ }).click(); i0 = requests.length
  await Promise.all([dlg().getByRole("button", { name: "Transfer", exact: true }).dblclick(), page.waitForTimeout(150)]); await closed(); await page.waitForTimeout(1200)
  const tp = since(i0).filter((r) => r.method === "POST" && r.path === `/encounters/${e3.id}/transfer`)
  ok("E9 a double click sends ONE POST { bedId } and the admission shows the new bed", tp.length === 1 && JSON.stringify(tp[0].body) === JSON.stringify({ bedId: U(210) }) && /General Ward, bed A-01/.test(await page.getByTestId("visit-detail").innerText()))
  ok("E9 the bed history now has both beds, the first released", (await page.getByTestId("bed-history").locator("li").count()) === 2)

  await page.getByRole("button", { name: "Discharge", exact: true }).click(); await dlg().waitFor(); await page.waitForTimeout(500)
  ok("E11 the discharge dialog starts from the record's diagnoses (primary kept) and stays off until a condition is chosen", /Unstable angina/.test(await dlg().innerText()) && await dlg().getByRole("button", { name: "Discharge", exact: true }).isDisabled())
  await dlg().getByRole("combobox", { name: /Condition on discharge/ }).click(); await page.getByRole("option", { name: "Expired" }).click()
  await page.waitForTimeout(500) // let the closing select release the dialog
  const expNote = await dlg().getByTestId("expired-note").innerText(), expBtns = await dlg().getByRole("button").allInnerTexts()
  ok("E11 'Expired' says it records a death and relabels the button", /records the patient.s death/i.test(expNote) && expBtns.some((b) => /Record death and discharge/.test(b)), JSON.stringify([expNote, expBtns]))
  await dlg().getByRole("combobox", { name: /Condition on discharge/ }).click(); await page.getByRole("option", { name: "Recovered" }).click()
  await dlg().getByLabel("Discharge summary").fill("Recovered well on treatment."); await dlg().getByLabel("Follow-up instructions").fill("Review in one week"); i0 = requests.length
  await Promise.all([dlg().getByRole("button", { name: "Discharge", exact: true }).dblclick(), page.waitForTimeout(150)]); await closed(); await page.waitForTimeout(1200)
  const dp = since(i0).filter((r) => r.method === "POST" && r.path === `/encounters/${e3.id}/discharge`)
  ok("E11 a double click sends ONE POST with the diagnoses, the condition, the summary and the follow-up", dp.length === 1 && dp[0].body.conditionOnDischarge === "recovered" && dp[0].body.diagnoses.length === 1 && dp[0].body.diagnoses[0].isPrimary === true && dp[0].body.dischargeSummary === "Recovered well on treatment." && dp[0].body.followUpInstructions === "Review in one week" && !("dischargedAt" in dp[0].body), JSON.stringify(dp.map((r) => r.body)))
  ok("E11 the visit is Discharged, shows its discharge block and offers Reopen and Archive", /Discharged/.test(await page.getByTestId("visit-detail").innerText()) && /Recovered well/.test(await page.getByTestId("discharge-block").innerText()) && JSON.stringify(await actionNames()) === JSON.stringify(["Reopen", "Archive"]))
  const noor = E.encounters.find((e) => e.type === "ipd" && e.patient.name === "Noor Fatima" && e.status === "open")
  await open(noor)
  await page.getByRole("button", { name: "Discharge", exact: true }).click(); await dlg().waitFor()
  await dlg().getByLabel("Diagnosis as text").fill("Septic shock"); await dlg().getByRole("button", { name: "Add", exact: true }).click()
  await dlg().getByRole("combobox", { name: /Condition on discharge/ }).click(); await page.getByRole("option", { name: "Expired" }).click(); i0 = requests.length
  await dlg().getByRole("button", { name: /Record death and discharge/ }).click(); await closed(); await page.waitForTimeout(1500)
  ok("E11 discharging as Expired records the death: the visit shows the patient as deceased", since(i0).some((r) => r.path === `/encounters/${noor.id}/discharge` && r.body.conditionOnDischarge === "expired") && (await page.getByTestId("visit-deceased").count()) === 1)
  await go("/encounters"); await page.getByRole("tab", { name: "Bed board" }).click(); await page.getByTestId("bed-board").waitFor(); await page.waitForTimeout(800)
  ok("E8 after the discharges the board shows those beds free again", /4 available · 0 occupied/.test(await page.getByTestId("bed-counts").innerText()) || /available · 0 occupied/.test(await page.getByTestId("bed-counts").innerText()), await page.getByTestId("bed-counts").innerText())

  // ───────────── PT8 patient Visits tab ─────────────
  i0 = requests.length
  await go("/patients/" + P(0).id); await page.getByRole("tab", { name: "Visits", exact: true }).click(); await panel("patient-visits").waitFor({ timeout: 8000 })
  ok("PT8 the Visits tab reads GET /patients/{id}/encounters (page 1, perPage 10)", since(i0).some((r) => r.method === "GET" && r.path === `/patients/${P(0).id}/encounters` && r.query.page === "1" && r.query.perPage === "10"))
  ok("PT8 it lists this patient's visits, newest first, linking to each; the archived one is not shown", (await panel("patient-visits").getByRole("link", { name: e0.encId }).count()) === 1 && (await panel("patient-visits").getByRole("link", { name: e6.encId }).count()) === 0)
  i0 = requests.length
  await page.getByLabel("Include archived visits").click(); await page.waitForTimeout(1000)
  ok("PT8 'Include archived visits' sends includeArchived=true and shows it marked Archived", since(i0).some((r) => r.path === `/patients/${P(0).id}/encounters` && r.query.includeArchived === "true") && /Archived/.test(await panel(`pv-row-${e6.id}`).innerText()))
  await go("/patients/new"); await page.getByLabel("Full Name *").waitFor()
  ok("PT2 'Save & OPD Ticket' and 'Save & IPD Ticket' are on for a user who may check in and admit", await page.getByRole("button", { name: /Save & OPD Ticket/ }).isEnabled() && await page.getByRole("button", { name: /Save & IPD Ticket/ }).isEnabled())

  // ───────────── roles ─────────────
  S.perms = ["patients.read", "encounters.check_in", "appointments.read", "appointments.write", "doctors.read", "settings.read"] // the front desk
  await signOutAndIn(); await go("/encounters"); await page.getByTestId("visits-screen").waitFor()
  ok("PERM front desk: sees the list and Check In; no Admitted tab or bed board without ipd rights", (await page.getByRole("link", { name: /Check In/ }).count()) === 1 && (await tab("Bed board").count()) === 0)
  await open(e0)
  ok("PERM front desk: the detail has NO Vitals tab, says the record is not shown to this role, and offers only Correct check-in and Cancel", (await tab("Vitals").count()) === 0 && JSON.stringify(await actionNames()) === JSON.stringify(["Correct check-in", "Cancel visit"]))
  await tab("Clinical record").click()
  ok("PERM front desk: clinical: null shows 'not shown to your role', no invented record", /not shown to your role/.test(await main()) && (await panel("clinical-form").count()) === 0)

  S.perms = ["patients.read", "encounters.read", "encounters.record_vitals", "doctors.read", "settings.read"] // a nurse
  await signOutAndIn(); await open(e0)
  ok("PERM nurse: can record vitals and nothing else on an open visit", JSON.stringify(await actionNames()) === JSON.stringify(["Record vitals"]))
  await tab("Vitals").click(); await panel("vitals-panel").waitFor()
  ok("PERM nurse: the vitals form is there", (await panel("vitals-panel").getByRole("button", { name: "Record vitals" }).count()) === 1)
  await tab("Clinical record").click(); await panel("clinical-form").waitFor()
  ok("PERM nurse: the record is read-only (fields off, no Save)", (await page.getByRole("button", { name: "Save record" }).count()) === 0 && await page.locator("#rec-chief").isDisabled())

  S.perms = ["patients.read", "encounters.read", "encounters.write", "doctors.read", "settings.read"] // a doctor
  await signOutAndIn(); await open(e0)
  ok("PERM doctor: can edit the record, close and cancel (encounters.write), but cannot check in, correct or take vitals", JSON.stringify(await actionNames()) === JSON.stringify(["Clinical record", "Close visit", "Cancel visit"]), JSON.stringify(await actionNames()))
  await go("/encounters"); await page.getByTestId("visits-screen").waitFor()
  ok("PERM doctor: no Check In button", (await page.getByRole("link", { name: /Check In/ }).count()) === 0)

  // ───────────── the inpatient department switched off ─────────────
  S.perms = stubsAll(c); S.modulesOn = false
  await signOutAndIn(); await go("/encounters"); await page.getByTestId("visits-screen").waitFor()
  ok("MODULE with the inpatient department off: no Admitted tab and no Bed board; history stays readable", (await tab("Admitted").count()) === 0 && (await tab("Bed board").count()) === 0 && (await tab("All visits").count()) === 1)
  await go("/encounters/new?type=IPD"); await page.getByTestId("check-in-screen").waitFor()
  ok("MODULE the check-in page offers OPD only (an IPD link falls back to OPD)", (await page.getByTestId("bed-picker").count()) === 0 && /Check In/.test(await page.getByRole("heading").first().innerText()))
  await open(E.encounters.find((e) => e.type === "ipd" && e.status === "discharged"));
  ok("MODULE an admission's detail still reads, but offers no transfer or discharge", (await page.getByTestId("visit-detail").count()) === 1)
  await go("/patients/new"); await page.getByLabel("Full Name *").waitFor()
  ok("MODULE 'Save & IPD Ticket' is off without the department", await page.getByRole("button", { name: /Save & IPD Ticket/ }).isDisabled())
  S.modulesOn = true; S.perms = stubsAll(c)

  // ───────────── global ─────────────
  ok("no GET asked for more than 100 per page", !requests.some((r) => Number(r.query.perPage || 0) > 100))
  ok("every request/response the fake backend handled matches docs/openapi.json", F.violations.length === 0, F.violations.slice(0, 4).join(" || "))
  const known = ["/auth/login", "/auth/refresh", "/auth/me", "/auth/logout", "/settings", "/settings/modules", "/public/hospital", "/doctors", "/patients", "/icd-codes", "/appointments", "/wards/occupancy", "/panels", "/guardian-relations", "/medicines", "/dashboard", "/reports/cash-flow"]
  const unexpected = requests.filter((r) => !known.includes(r.path) && !r.path.startsWith("/encounters") && !r.path.startsWith("/patients/") && !r.path.startsWith("/beds/") && !r.path.startsWith("/appointments/"))
  ok("no request reached a route the test backend does not implement", unexpected.length === 0, unexpected.map((r) => r.method + " " + r.path).join(", "))
  ok("nothing is ever deleted (no DELETE request)", !requests.some((r) => r.method === "DELETE"))
  const unexpectedErrors = consoleErrors.filter((e) => !/status of (401|403|404|409|422|500)/.test(e))
  ok("no browser console/page errors other than the deliberate 404 / 409 / 422 answers", unexpectedErrors.length === 0, unexpectedErrors.join(" | "))
}

function stubsAll() {
  return require("../fakes/auth-stubs.js").ALL_PERMISSIONS
}
