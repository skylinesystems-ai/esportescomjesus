import {
  auth,
  db,
  isFirebaseConfigured,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  deleteField,
  serverTimestamp
} from "./firebase.js";

const state = {
  user: null,
  profile: null,
  organization: null,
  organizationId: "",
  team: [],
  auditLogs: [],
  alunos: [],
  turmas: [],
  presencasHoje: [],
  pagamentos: [],
  editingStudentId: null,
  editingClassId: null,
  selectedAttendanceClassId: "",
  financeMonth: getCurrentMonth()
};

let registrationInProgress = false;

const roleLabels = {
  admin: "Administrador",
  secretaria: "Secretaria",
  professor: "Professor",
  financeiro: "Financeiro"
};

const rolePermissions = {
  admin: ["*"],
  secretaria: [
    "students:write",
    "classes:write",
    "attendance:write",
    "finance:read"
  ],
  professor: ["students:read", "classes:read", "attendance:write"],
  financeiro: ["students:read", "classes:read", "finance:read", "finance:write"]
};

const scopedCollections = ["alunos", "turmas", "presencas", "pagamentos"];

const officialClassTemplates = [
  {
    nome: "Funcional - Seg/Qua/Sex 08:00",
    modalidade: "Funcional",
    diasSemana: ["Seg", "Qua", "Sex"],
    horarioInicial: "08:00",
    horarioFinal: "09:00",
    limiteVagas: 40,
    valorPadraoMensalidade: 0
  },
  {
    nome: "Kickboxing - Seg/Qua/Sex 17:00",
    modalidade: "Kickboxing",
    diasSemana: ["Seg", "Qua", "Sex"],
    horarioInicial: "17:00",
    horarioFinal: "18:00",
    limiteVagas: 30,
    valorPadraoMensalidade: 0
  },
  {
    nome: "Jiu-Jitsu Kids - Seg/Qua/Sex 18:00",
    modalidade: "Jiu-Jitsu Kids",
    diasSemana: ["Seg", "Qua", "Sex"],
    horarioInicial: "18:00",
    horarioFinal: "19:00",
    limiteVagas: 30,
    valorPadraoMensalidade: 0
  },
  {
    nome: "Funcional - Seg/Qua/Sex 18:00",
    modalidade: "Funcional",
    diasSemana: ["Seg", "Qua", "Sex"],
    horarioInicial: "18:00",
    horarioFinal: "19:00",
    limiteVagas: 40,
    valorPadraoMensalidade: 0
  },
  {
    nome: "Jiu-Jitsu - Seg/Qua/Sex 19:00",
    modalidade: "Jiu-Jitsu",
    diasSemana: ["Seg", "Qua", "Sex"],
    horarioInicial: "19:00",
    horarioFinal: "20:00",
    limiteVagas: 35,
    valorPadraoMensalidade: 0
  },
  {
    nome: "Reforco Escolar - Ter/Qui 17:30",
    modalidade: "Reforco Escolar",
    diasSemana: ["Ter", "Qui"],
    horarioInicial: "17:30",
    horarioFinal: "18:30",
    limiteVagas: 20,
    valorPadraoMensalidade: 0
  },
  {
    nome: "Futsal - Ter/Qui 17:30",
    modalidade: "Futsal",
    diasSemana: ["Ter", "Qui"],
    horarioInicial: "17:30",
    horarioFinal: "18:30",
    limiteVagas: 30,
    valorPadraoMensalidade: 0
  },
  {
    nome: "Jiu-Jitsu - Ter/Qui 18:00",
    modalidade: "Jiu-Jitsu",
    diasSemana: ["Ter", "Qui"],
    horarioInicial: "18:00",
    horarioFinal: "19:00",
    limiteVagas: 35,
    valorPadraoMensalidade: 0
  },
  {
    nome: "Kickboxing - Ter/Qui 19:00",
    modalidade: "Kickboxing",
    diasSemana: ["Ter", "Qui"],
    horarioInicial: "19:00",
    horarioFinal: "20:00",
    limiteVagas: 30,
    valorPadraoMensalidade: 0
  },
  {
    nome: "Funcional - Ter/Qui 19:00",
    modalidade: "Funcional",
    diasSemana: ["Ter", "Qui"],
    horarioInicial: "19:00",
    horarioFinal: "20:00",
    limiteVagas: 40,
    valorPadraoMensalidade: 0
  }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  bindAuthEvents();
  bindNavigationEvents();
  bindCrudEvents();
  bindFinanceEvents();
  setStaticDateLabels();
  $("#financeMonth").value = state.financeMonth;

  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    $("#loadingView").classList.add("is-hidden");

    if (!user) {
      state.profile = null;
      state.organization = null;
      state.organizationId = "";
      showAuthView();
      return;
    }

    if (registrationInProgress) return;

    showAppView();
    try {
      await ensureUserProfile(user);
      $("#userEmail").textContent = `${user.email || "Conta ativa"} · ${roleLabels[state.profile?.role] || "Perfil"}`;
      await loadAllData();
    } catch (error) {
      notify(`Não foi possível carregar a organização. Publique as novas regras do Firestore. ${error.message}`, "error");
    }
  });
});

function bindAuthEvents() {
  $$(".auth-tab").forEach((button) => {
    button.addEventListener("click", () => setAuthTab(button.dataset.authTab));
  });

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureFirebaseConfig()) return;

    try {
      await signInWithEmailAndPassword(auth, $("#loginEmail").value.trim(), $("#loginPassword").value);
    } catch (error) {
      notify(`Não foi possível entrar: ${error.message}`, "error");
    }
  });

  $("#registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureFirebaseConfig()) return;

    try {
      registrationInProgress = true;
      const credential = await createUserWithEmailAndPassword(
        auth,
        $("#registerEmail").value.trim(),
        $("#registerPassword").value
      );

      await createInitialProfile(credential.user, $("#registerName").value.trim(), $("#registerInviteCode").value.trim());
      registrationInProgress = false;
      state.user = credential.user;
      showAppView();
      await ensureUserProfile(credential.user);
      $("#userEmail").textContent = `${credential.user.email || "Conta ativa"} · ${roleLabels[state.profile?.role] || "Perfil"}`;
      await loadAllData();
      notify("Conta criada com sucesso.", "success");
    } catch (error) {
      registrationInProgress = false;
      notify(`Não foi possível cadastrar: ${error.message}`, "error");
    }
  });

  $("#logoutButton").addEventListener("click", handleLogout);
  $("#mobileLogoutButton").addEventListener("click", handleLogout);
}

function bindNavigationEvents() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.view));
  });

  $("#reloadDashboardButton").addEventListener("click", loadAllData);
}

function bindCrudEvents() {
  $("#openStudentModalButton").addEventListener("click", () => openStudentModal());
  $("#openClassModalButton").addEventListener("click", () => openClassModal());
  $("#seedOfficialClassesButton").addEventListener("click", seedOfficialClasses);
  $("#studentForm").addEventListener("submit", saveStudent);
  $("#classForm").addEventListener("submit", saveClass);
  $("#studentSearch").addEventListener("input", renderStudents);
  $("#attendanceClassSelect").addEventListener("change", (event) => {
    state.selectedAttendanceClassId = event.target.value;
    renderAttendance();
  });

  $$("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  $$(".modal").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal.id);
    });
  });
}

function bindFinanceEvents() {
  $("#financeMonth").addEventListener("change", async (event) => {
    state.financeMonth = event.target.value || getCurrentMonth();
    await loadPayments();
    renderDashboard();
    renderFinance();
  });

  $("#syncPaymentsButton").addEventListener("click", syncPaymentsForMonth);
}

function setAuthTab(tab) {
  const isLogin = tab === "login";
  $("#loginForm").classList.toggle("is-hidden", !isLogin);
  $("#registerForm").classList.toggle("is-hidden", isLogin);
  $$(".auth-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTab === tab);
  });
}

async function handleLogout() {
  try {
    await signOut(auth);
  } catch (error) {
    notify(`Erro ao sair: ${error.message}`, "error");
  }
}

async function ensureUserProfile(user) {
  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    await createInitialProfile(user, user.displayName || user.email || "Gestor", "");
  } else {
    state.profile = { id: profileSnap.id, ...profileSnap.data() };
  }

  if (!state.profile.organizationId) {
    const organization = await createOrganizationWithInvite(user);

    await updateDoc(profileRef, {
      organizationId: organization.id,
      role: state.profile.role || "admin",
      updatedAt: serverTimestamp()
    });

    state.profile = {
      ...state.profile,
      organizationId: organization.id,
      role: state.profile.role || "admin"
    };
  }

  state.organizationId = state.profile.organizationId;
  const organizationSnap = await getDoc(doc(db, "organizations", state.organizationId));
  state.organization = organizationSnap.exists()
    ? { id: organizationSnap.id, ...organizationSnap.data() }
    : { id: state.organizationId, nome: "Esportes com Jesus Manaus", inviteCode: "---" };
  await ensureInviteCodeDocument(state.organization);
}

async function createInitialProfile(user, name, inviteCode) {
  const cleanInviteCode = String(inviteCode || "").trim().toUpperCase();
  let organizationId = "";
  let role = "admin";

  if (cleanInviteCode) {
    const inviteSnap = await getDoc(doc(db, "inviteCodes", cleanInviteCode));
    if (!inviteSnap.exists() || inviteSnap.data().active === false) {
      throw new Error("Código da instituição não encontrado.");
    }
    organizationId = inviteSnap.data().organizationId;
    role = "professor";
  } else {
    const organization = await createOrganizationWithInvite(user);
    organizationId = organization.id;
  }

  const profile = {
    nome: name || user.email || "Usuário",
    email: user.email,
    userId: user.uid,
    organizationId,
    role,
    active: true,
    joinedWithInviteCode: cleanInviteCode || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(db, "users", user.uid), profile);
  state.profile = { id: user.uid, ...profile };
  state.organizationId = organizationId;
}

async function createOrganizationWithInvite(user) {
  const inviteCode = generateInviteCode();
  const organizationRef = await addDoc(collection(db, "organizations"), {
    nome: "Esportes com Jesus Manaus",
    inviteCode,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await setDoc(doc(db, "inviteCodes", inviteCode), {
    code: inviteCode,
    organizationId: organizationRef.id,
    organizationName: "Esportes com Jesus Manaus",
    active: true,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { id: organizationRef.id, inviteCode };
}

async function ensureInviteCodeDocument(organization) {
  if (!organization?.inviteCode || organization.inviteCode === "---" || !can("settings:write")) return;

  const inviteRef = doc(db, "inviteCodes", organization.inviteCode);
  const inviteSnap = await getDoc(inviteRef);
  if (inviteSnap.exists()) return;

  await setDoc(inviteRef, {
    code: organization.inviteCode,
    organizationId: organization.id,
    organizationName: organization.nome || "Esportes com Jesus Manaus",
    active: true,
    createdBy: organization.createdBy || state.user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function showAuthView() {
  $("#authView").classList.remove("is-hidden");
  $("#appShell").classList.add("is-hidden");
}

function showAppView() {
  $("#authView").classList.add("is-hidden");
  $("#appShell").classList.remove("is-hidden");
}

function showSection(viewName) {
  if (viewName === "financeiro" && !(can("finance:read") || can("finance:write"))) {
    notify("Você não tem acesso ao financeiro.", "error");
    viewName = "dashboard";
  }
  if (viewName === "configuracoes" && !(can("settings:read") || can("settings:write"))) {
    notify("Você não tem acesso às configurações.", "error");
    viewName = "dashboard";
  }

  $$(".view-section").forEach((section) => {
    section.hidden = section.id !== `${viewName}View`;
  });

  $$(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });

  if (viewName === "presenca") renderAttendance();
  if (viewName === "financeiro") renderFinance();
}

async function loadAllData() {
  if (!state.user || !state.organizationId) return;

  try {
    const tasks = [loadClasses(), loadStudents(), loadTodayAttendance()];

    if (can("finance:read") || can("finance:write")) {
      tasks.push(loadPayments());
    } else {
      state.pagamentos = [];
    }

    if (can("settings:read") || can("settings:write")) {
      tasks.push(loadTeam(), loadAuditLogs());
    } else {
      state.team = [];
      state.auditLogs = [];
    }

    await Promise.all(tasks);
    renderAll();
  } catch (error) {
    notify(`Erro ao carregar dados: ${error.message}`, "error");
  }
}

async function loadStudents() {
  state.alunos = (await getScopedDocs("alunos"))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}

async function loadClasses() {
  state.turmas = (await getScopedDocs("turmas"))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}

async function loadTodayAttendance() {
  state.presencasHoje = (await getScopedDocs("presencas"))
    .filter((item) => item.data === getTodayKey());
}

async function loadPayments() {
  state.pagamentos = (await getScopedDocs("pagamentos"))
    .filter((item) => item.mesReferencia === state.financeMonth)
    .sort((a, b) => (a.alunoNome || "").localeCompare(b.alunoNome || "", "pt-BR"));
}

async function loadTeam() {
  const snapshot = await getDocs(query(collection(db, "users"), where("organizationId", "==", state.organizationId)));
  state.team = snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => (a.nome || a.email || "").localeCompare(b.nome || b.email || "", "pt-BR"));
}

async function loadAuditLogs() {
  const snapshot = await getDocs(query(collection(db, "auditLogs"), where("organizationId", "==", state.organizationId)));
  state.auditLogs = snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt))
    .slice(0, 12);
}

async function getScopedDocs(collectionName) {
  const byOrganization = await getDocs(query(collection(db, collectionName), where("organizationId", "==", state.organizationId)));
  const byOwner = await getDocs(query(collection(db, collectionName), where("userId", "==", state.user.uid)));
  const items = new Map();

  byOrganization.docs.forEach((item) => items.set(item.id, { id: item.id, ...item.data() }));
  byOwner.docs.forEach((item) => items.set(item.id, { id: item.id, ...item.data() }));

  await migrateLegacyDocs(collectionName, [...items.values()].filter((item) => !item.organizationId));
  return [...items.values()].map((item) => ({
    ...item,
    organizationId: item.organizationId || state.organizationId
  }));
}

async function migrateLegacyDocs(collectionName, docsToMigrate) {
  if (!docsToMigrate.length) return;

  await Promise.all(docsToMigrate.map((item) => updateDoc(doc(db, collectionName, item.id), {
    organizationId: state.organizationId,
    updatedAt: serverTimestamp()
  }).catch(() => null)));
}

function renderAll() {
  renderClassOptions();
  renderDashboard();
  renderStudents();
  renderClasses();
  renderAttendanceOptions();
  renderAttendance();
  renderFinance();
  renderSettings();
  applyRoleAccess();
}

function renderDashboard() {
  const activeStudents = state.alunos.filter((aluno) => aluno.status === "ativo").length;
  const lateStudents = state.alunos.filter((aluno) => aluno.status === "inadimplente").length;
  const presentToday = state.presencasHoje.filter((item) => item.status === "presente").length;
  const expectedRevenue = sumBy(state.pagamentos, "valor") || sumBy(
    state.alunos.filter((aluno) => aluno.status !== "cancelado"),
    "valorMensalidade"
  );
  const receivedRevenue = sumBy(state.pagamentos.filter((item) => item.status === "pago"), "valor");
  const overduePayments = state.pagamentos.filter((item) => item.status === "atrasado");
  const openRevenue = Math.max(expectedRevenue - receivedRevenue, 0);
  const canSeeFinance = can("finance:read") || can("finance:write");

  $("#statActiveStudents").textContent = activeStudents;
  $("#statLateStudents").textContent = lateStudents;
  $("#statClasses").textContent = state.turmas.length;
  $("#statTodayAttendance").textContent = presentToday;
  $("#dashboardHeadlinePresence").textContent = presentToday;
  $("#statExpectedRevenue").textContent = canSeeFinance ? formatCurrency(expectedRevenue) : "Restrito";
  $("#statOverduePayments").textContent = canSeeFinance ? overduePayments.length : "Restrito";
  $("#dashboardReceived").textContent = canSeeFinance ? formatCurrency(receivedRevenue) : "Restrito";
  $("#dashboardOpen").textContent = canSeeFinance ? formatCurrency(openRevenue) : "Restrito";

  const statuses = ["ativo", "inadimplente", "trancado", "cancelado"];
  $("#statusSummary").innerHTML = statuses.map((status) => {
    const total = state.alunos.filter((aluno) => aluno.status === status).length;
    return `
      <div class="summary-row">
        <span class="status-badge ${status}">${labelStatus(status)}</span>
        <strong>${total}</strong>
      </div>
    `;
  }).join("");
}

function renderStudents() {
  const search = $("#studentSearch").value.trim().toLowerCase();
  const students = state.alunos.filter((aluno) => (aluno.nome || "").toLowerCase().includes(search));
  const container = $("#studentsList");

  if (!students.length) {
    container.innerHTML = emptyState("Nenhum aluno encontrado.");
    return;
  }

  container.innerHTML = students.map((aluno) => {
    const whatsappButton = (aluno.status === "inadimplente" && can("finance:write"))
      ? `<button class="ghost-action compact" type="button" data-whatsapp-student="${aluno.id}">Cobrar no WhatsApp</button>`
      : "";
    const actionButtons = can("students:write")
      ? `
          <button class="ghost-action compact" type="button" data-edit-student="${aluno.id}">Editar</button>
          <button class="danger-action compact" type="button" data-delete-student="${aluno.id}">Excluir</button>
        `
      : "";

    return `
      <article class="entity-card">
        <div class="entity-main">
          <div class="entity-title-row">
            <span class="avatar-bubble">${escapeHtml(getInitials(aluno.nome || "AL"))}</span>
            <div>
              <span class="status-badge ${aluno.status || "ativo"}">${labelStatus(aluno.status)}</span>
              <h3>${escapeHtml(aluno.nome || "Aluno sem nome")}</h3>
              <p>${escapeHtml(aluno.turma || "Sem turma definida")}</p>
            </div>
          </div>
          <strong>${formatCurrency(aluno.valorMensalidade || 0)}</strong>
        </div>
        <div class="entity-details">
          <span>WhatsApp: ${escapeHtml(aluno.whatsapp || "-")}</span>
          <span>Vencimento: dia ${aluno.diaVencimento || "-"}</span>
          <span>Responsável: ${escapeHtml(aluno.responsavelNome || "-")}</span>
        </div>
        <div class="entity-actions">
          ${whatsappButton}
          ${actionButtons}
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-edit-student]").forEach((button) => {
    button.addEventListener("click", () => openStudentModal(button.dataset.editStudent));
  });
  container.querySelectorAll("[data-delete-student]").forEach((button) => {
    button.addEventListener("click", () => deleteStudent(button.dataset.deleteStudent));
  });
  container.querySelectorAll("[data-whatsapp-student]").forEach((button) => {
    button.addEventListener("click", () => chargeStudentOnWhatsapp(button.dataset.whatsappStudent));
  });
}

function renderClasses() {
  const container = $("#classesList");

  if (!state.turmas.length) {
    container.innerHTML = emptyState("Nenhuma turma cadastrada.");
    return;
  }

  container.innerHTML = state.turmas.map((turma) => {
    const studentsInClass = state.alunos.filter((aluno) => aluno.turma === turma.nome).length;
    const actionButtons = can("classes:write")
      ? `
          <button class="ghost-action compact" type="button" data-edit-class="${turma.id}">Editar</button>
          <button class="danger-action compact" type="button" data-delete-class="${turma.id}">Excluir</button>
        `
      : "";
    return `
      <article class="entity-card">
        <div class="entity-main">
          <div class="entity-title-row">
            <span class="avatar-bubble green">${escapeHtml(getInitials(turma.modalidade || turma.nome || "T").slice(0, 1))}</span>
            <div>
              <h3>${escapeHtml(turma.nome || "Turma sem nome")}</h3>
              <p>${escapeHtml(turma.modalidade || "-")} · Prof. ${escapeHtml(turma.professor || "-")}</p>
            </div>
          </div>
          <strong class="capacity-pill">${studentsInClass}/${turma.limiteVagas || 0}</strong>
        </div>
        <div class="entity-details">
          <span>Dias: ${(turma.diasSemana || []).join(", ") || "-"}</span>
          <span>Horário: ${turma.horarioInicial || "--:--"} às ${turma.horarioFinal || "--:--"}</span>
          <span>Mensalidade: ${formatCurrency(turma.valorPadraoMensalidade || 0)}</span>
        </div>
        <div class="entity-actions">
          ${actionButtons}
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-edit-class]").forEach((button) => {
    button.addEventListener("click", () => openClassModal(button.dataset.editClass));
  });
  container.querySelectorAll("[data-delete-class]").forEach((button) => {
    button.addEventListener("click", () => deleteClass(button.dataset.deleteClass));
  });
}

function renderClassOptions() {
  const select = $("#studentClass");
  select.innerHTML = `<option value="">Sem turma</option>` + state.turmas.map((turma) => (
    `<option value="${escapeAttribute(turma.nome || "")}">${escapeHtml(turma.nome || "Turma sem nome")}</option>`
  )).join("");
}

function renderAttendanceOptions() {
  const select = $("#attendanceClassSelect");
  select.innerHTML = state.turmas.length
    ? state.turmas.map((turma) => `<option value="${turma.id}">${escapeHtml(turma.nome || "Turma")}</option>`).join("")
    : `<option value="">Cadastre uma turma</option>`;

  if (!state.selectedAttendanceClassId && state.turmas[0]) {
    state.selectedAttendanceClassId = state.turmas[0].id;
  }

  select.value = state.selectedAttendanceClassId;
}

function renderAttendance() {
  renderAttendanceOptions();
  const turma = state.turmas.find((item) => item.id === state.selectedAttendanceClassId);
  const container = $("#attendanceList");

  if (!turma) {
    $("#presenceTotal").textContent = "0";
    container.innerHTML = emptyState("Cadastre uma turma para iniciar o check-in.");
    return;
  }

  const students = state.alunos.filter((aluno) => aluno.turma === turma.nome && aluno.status !== "cancelado");
  const presentTotal = state.presencasHoje.filter((item) => (
    item.turmaId === turma.id && item.status === "presente"
  )).length;

  $("#presenceTotal").textContent = presentTotal;

  if (!students.length) {
    container.innerHTML = emptyState("Nenhum aluno ativo nesta turma.");
    return;
  }

  container.innerHTML = students.map((aluno) => {
    const currentPresence = state.presencasHoje.find((item) => item.alunoId === aluno.id && item.turmaId === turma.id);
    const status = currentPresence?.status || "";

    return `
      <article class="entity-card attendance-card">
        <div class="entity-main">
          <div class="entity-title-row">
            <span class="avatar-bubble">${escapeHtml(getInitials(aluno.nome || "AL"))}</span>
            <div>
              <h3>${escapeHtml(aluno.nome || "Aluno")}</h3>
              <p>${escapeHtml(turma.modalidade || "-")}</p>
            </div>
          </div>
          ${status ? `<span class="status-badge ${status}">${labelPresence(status)}</span>` : ""}
        </div>
        <div class="presence-actions">
          ${presenceButton(aluno.id, turma.id, "presente", status, !can("attendance:write"))}
          ${presenceButton(aluno.id, turma.id, "falta", status, !can("attendance:write"))}
          ${presenceButton(aluno.id, turma.id, "atraso", status, !can("attendance:write"))}
          ${presenceButton(aluno.id, turma.id, "reposicao", status, !can("attendance:write"))}
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-presence-status]").forEach((button) => {
    button.addEventListener("click", () => savePresence(button.dataset.studentId, button.dataset.classId, button.dataset.presenceStatus));
  });
}

function presenceButton(studentId, classId, status, currentStatus, disabled = false) {
  const activeClass = currentStatus === status ? "is-selected" : "";
  return `
    <button
      class="presence-button ${activeClass}"
      type="button"
      ${disabled ? "disabled" : ""}
      data-student-id="${studentId}"
      data-class-id="${classId}"
      data-presence-status="${status}"
    >
      ${labelPresence(status)}
    </button>
  `;
}

function renderFinance() {
  const container = $("#paymentsList");
  const expected = sumBy(state.pagamentos, "valor");
  const received = sumBy(state.pagamentos.filter((item) => item.status === "pago"), "valor");
  const late = sumBy(state.pagamentos.filter((item) => item.status === "atrasado"), "valor");

  $("#financeExpected").textContent = formatCurrency(expected);
  $("#financeReceived").textContent = formatCurrency(received);
  $("#financeLate").textContent = formatCurrency(late);

  if (!state.pagamentos.length) {
    container.innerHTML = emptyState("Clique em Atualizar mês para gerar mensalidades.");
    return;
  }

  container.innerHTML = state.pagamentos.map((pagamento) => {
    const whatsappButton = (pagamento.status === "atrasado" && can("finance:write"))
      ? `<button class="ghost-action compact" type="button" data-whatsapp-payment="${pagamento.id}">Cobrar no WhatsApp</button>`
      : "";
    const financeButtons = can("finance:write")
      ? `
          <button class="ghost-action compact" type="button" data-payment-status="pago" data-payment-id="${pagamento.id}">Pago</button>
          <button class="ghost-action compact" type="button" data-payment-status="pendente" data-payment-id="${pagamento.id}">Pendente</button>
          <button class="danger-action compact" type="button" data-payment-status="atrasado" data-payment-id="${pagamento.id}">Atrasada</button>
        `
      : "";

    return `
      <article class="entity-card">
        <div class="entity-main">
          <div class="entity-title-row">
            <span class="avatar-bubble">${escapeHtml(getInitials(pagamento.alunoNome || "AL"))}</span>
            <div>
              <span class="status-badge ${pagamento.status || "pendente"}">${labelPayment(pagamento.status)}</span>
              <h3>${escapeHtml(pagamento.alunoNome || "Aluno")}</h3>
              <p>Vencimento: ${formatDate(pagamento.vencimento)}${pagamento.reciboNumero ? ` · Recibo ${escapeHtml(pagamento.reciboNumero)}` : ""}</p>
            </div>
          </div>
          <strong>${formatCurrency(pagamento.valor || 0)}</strong>
        </div>
        <div class="entity-actions">
          ${whatsappButton}
          ${financeButtons}
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-payment-status]").forEach((button) => {
    button.addEventListener("click", () => updatePaymentStatus(button.dataset.paymentId, button.dataset.paymentStatus));
  });
  container.querySelectorAll("[data-whatsapp-payment]").forEach((button) => {
    button.addEventListener("click", () => chargePaymentOnWhatsapp(button.dataset.whatsappPayment));
  });
}

function renderSettings() {
  $("#settingsOrgName").textContent = state.organization?.nome || "Esportes com Jesus Manaus";
  $("#settingsInviteCode").textContent = state.organization?.inviteCode || "---";
  $("#settingsCurrentRole").textContent = roleLabels[state.profile?.role] || "---";

  const teamContainer = $("#teamList");
  if (!state.team.length) {
    teamContainer.innerHTML = emptyState("Nenhum membro encontrado.");
  } else {
    teamContainer.innerHTML = state.team.map((member) => {
      const roleSelect = can("settings:write") && member.id !== state.user.uid
        ? `
          <select class="role-select" data-role-user="${member.id}">
            ${Object.keys(roleLabels).map((role) => (
              `<option value="${role}" ${member.role === role ? "selected" : ""}>${roleLabels[role]}</option>`
            )).join("")}
          </select>
        `
        : `<span class="status-badge ativo">${roleLabels[member.role] || "Perfil"}</span>`;

      return `
        <article class="mini-card">
          <div class="mini-card-main">
            <div>
              <strong>${escapeHtml(member.nome || member.email || "Usuário")}</strong>
              <p>${escapeHtml(member.email || "-")}</p>
            </div>
            ${roleSelect}
          </div>
        </article>
      `;
    }).join("");

    teamContainer.querySelectorAll("[data-role-user]").forEach((select) => {
      select.addEventListener("change", () => updateUserRole(select.dataset.roleUser, select.value));
    });
  }

  const auditContainer = $("#auditList");
  auditContainer.innerHTML = state.auditLogs.length
    ? state.auditLogs.map((log) => `
      <article class="mini-card">
        <div class="mini-card-main">
          <div>
            <strong>${escapeHtml(labelAuditAction(log.action))}</strong>
            <p>${escapeHtml(log.entity || "-")} · ${escapeHtml(log.userEmail || "-")}</p>
          </div>
          <span>${escapeHtml(formatAuditDate(log.createdAt))}</span>
        </div>
      </article>
    `).join("")
    : emptyState("Nenhuma ação registrada ainda.");
}

function applyRoleAccess() {
  const canSeeFinance = can("finance:read") || can("finance:write");
  const canSeeSettings = can("settings:read") || can("settings:write");
  const accessByView = {
    financeiro: canSeeFinance,
    configuracoes: canSeeSettings
  };

  $$(".nav-item").forEach((button) => {
    const allowed = accessByView[button.dataset.view];
    if (allowed === undefined) return;
    button.hidden = !allowed;
    if (!allowed && button.classList.contains("is-active")) showSection("dashboard");
  });

  $("#openStudentModalButton").disabled = !can("students:write");
  $("#openClassModalButton").disabled = !can("classes:write");
  $("#seedOfficialClassesButton").disabled = !can("classes:write");
  $("#syncPaymentsButton").disabled = !can("finance:write");
}

async function updateUserRole(userId, role) {
  if (!can("settings:write")) {
    notify("Você não tem permissão para alterar perfis.", "error");
    return;
  }

  try {
    await updateDoc(doc(db, "users", userId), {
      role,
      updatedAt: serverTimestamp()
    });
    await logAudit("user.role_updated", "users", userId, { role });
    await loadTeam();
    await loadAuditLogs();
    renderSettings();
    notify("Perfil atualizado.", "success");
  } catch (error) {
    notify(`Erro ao atualizar perfil: ${error.message}`, "error");
  }
}

function openStudentModal(studentId = null) {
  state.editingStudentId = studentId;
  renderClassOptions();

  const aluno = state.alunos.find((item) => item.id === studentId);
  $("#studentModalTitle").textContent = aluno ? "Editar aluno" : "Cadastrar aluno";
  $("#studentId").value = aluno?.id || "";
  $("#studentName").value = aluno?.nome || "";
  $("#studentWhatsapp").value = aluno?.whatsapp || "";
  $("#studentGuardianName").value = aluno?.responsavelNome || "";
  $("#studentGuardianPhone").value = aluno?.responsavelTelefone || "";
  $("#studentMonthlyFee").value = aluno?.valorMensalidade ?? "";
  $("#studentDueDay").value = aluno?.diaVencimento || 10;
  $("#studentStatus").value = aluno?.status || "ativo";
  $("#studentNotes").value = aluno?.observacoes || "";

  if (aluno?.turma && !state.turmas.some((turma) => turma.nome === aluno.turma)) {
    $("#studentClass").insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeAttribute(aluno.turma)}">${escapeHtml(aluno.turma)}</option>`
    );
  }
  $("#studentClass").value = aluno?.turma || "";
  openModal("studentModal");
}

async function saveStudent(event) {
  event.preventDefault();
  if (!state.user) return;
  if (!can("students:write")) {
    notify("Você não tem permissão para salvar alunos.", "error");
    return;
  }

  const selectedClassName = $("#studentClass").value;
  const selectedClass = state.turmas.find((turma) => turma.nome === selectedClassName);
  const aluno = {
    nome: $("#studentName").value.trim(),
    whatsapp: $("#studentWhatsapp").value.trim(),
    responsavelNome: $("#studentGuardianName").value.trim(),
    responsavelTelefone: $("#studentGuardianPhone").value.trim(),
    modalidade: selectedClass?.modalidade || "",
    turma: selectedClassName,
    valorMensalidade: Number($("#studentMonthlyFee").value || 0),
    diaVencimento: Number($("#studentDueDay").value || 10),
    status: $("#studentStatus").value,
    observacoes: $("#studentNotes").value.trim(),
    userId: state.user.uid,
    organizationId: state.organizationId,
    updatedAt: serverTimestamp()
  };

  if (!aluno.nome) {
    notify("Informe o nome do aluno.", "warning");
    return;
  }

  try {
    if (state.editingStudentId) {
      await updateDoc(doc(db, "alunos", state.editingStudentId), {
        ...aluno,
        telefone: deleteField()
      });
      await logAudit("student.updated", "alunos", state.editingStudentId, { nome: aluno.nome });
    } else {
      const studentRef = await addDoc(collection(db, "alunos"), {
        ...aluno,
        dataCadastro: new Date().toISOString(),
        createdAt: serverTimestamp()
      });
      await logAudit("student.created", "alunos", studentRef.id, { nome: aluno.nome });
    }

    closeModal("studentModal");
    await loadAllData();
    notify("Aluno salvo com sucesso.", "success");
  } catch (error) {
    notify(`Erro ao salvar aluno: ${error.message}`, "error");
  }
}

async function deleteStudent(studentId) {
  if (!can("students:write")) {
    notify("Você não tem permissão para excluir alunos.", "error");
    return;
  }
  if (!confirm("Deseja excluir este aluno?")) return;

  try {
    await deleteDoc(doc(db, "alunos", studentId));
    await logAudit("student.deleted", "alunos", studentId);
    await loadAllData();
    notify("Aluno excluído.", "success");
  } catch (error) {
    notify(`Erro ao excluir aluno: ${error.message}`, "error");
  }
}

function openClassModal(classId = null) {
  state.editingClassId = classId;
  const turma = state.turmas.find((item) => item.id === classId);

  $("#classModalTitle").textContent = turma ? "Editar turma" : "Cadastrar turma";
  $("#classId").value = turma?.id || "";
  $("#className").value = turma?.nome || "";
  $("#classSport").value = turma?.modalidade || "";
  $("#classTeacher").value = turma?.professor || "";
  $("#classStart").value = turma?.horarioInicial || "";
  $("#classEnd").value = turma?.horarioFinal || "";
  $("#classLimit").value = turma?.limiteVagas ?? "";
  $("#classDefaultFee").value = turma?.valorPadraoMensalidade ?? "";
  $$("input[name='classDays']").forEach((checkbox) => {
    checkbox.checked = (turma?.diasSemana || []).includes(checkbox.value);
  });

  openModal("classModal");
}

async function saveClass(event) {
  event.preventDefault();
  if (!state.user) return;
  if (!can("classes:write")) {
    notify("Você não tem permissão para salvar turmas.", "error");
    return;
  }

  const turma = {
    nome: $("#className").value.trim(),
    modalidade: $("#classSport").value.trim(),
    professor: $("#classTeacher").value.trim(),
    diasSemana: $$("input[name='classDays']:checked").map((item) => item.value),
    horarioInicial: $("#classStart").value,
    horarioFinal: $("#classEnd").value,
    limiteVagas: Number($("#classLimit").value || 0),
    valorPadraoMensalidade: Number($("#classDefaultFee").value || 0),
    userId: state.user.uid,
    organizationId: state.organizationId,
    updatedAt: serverTimestamp()
  };

  if (!turma.nome || !turma.modalidade) {
    notify("Informe nome e modalidade da turma.", "warning");
    return;
  }

  try {
    if (state.editingClassId) {
      await updateDoc(doc(db, "turmas", state.editingClassId), turma);
      await logAudit("class.updated", "turmas", state.editingClassId, { nome: turma.nome });
    } else {
      const classRef = await addDoc(collection(db, "turmas"), {
        ...turma,
        createdAt: serverTimestamp()
      });
      await logAudit("class.created", "turmas", classRef.id, { nome: turma.nome });
    }

    closeModal("classModal");
    await loadAllData();
    notify("Turma salva com sucesso.", "success");
  } catch (error) {
    notify(`Erro ao salvar turma: ${error.message}`, "error");
  }
}

async function deleteClass(classId) {
  if (!can("classes:write")) {
    notify("Você não tem permissão para excluir turmas.", "error");
    return;
  }
  if (!confirm("Deseja excluir esta turma?")) return;

  try {
    await deleteDoc(doc(db, "turmas", classId));
    await logAudit("class.deleted", "turmas", classId);
    if (state.selectedAttendanceClassId === classId) state.selectedAttendanceClassId = "";
    await loadAllData();
    notify("Turma excluída.", "success");
  } catch (error) {
    notify(`Erro ao excluir turma: ${error.message}`, "error");
  }
}

async function seedOfficialClasses() {
  if (!state.user) return;
  if (!can("classes:write")) {
    notify("Você não tem permissão para criar turmas.", "error");
    return;
  }

  try {
    const existingKeys = new Set(state.turmas.map((turma) => (
      `${turma.nome || ""}|${turma.horarioInicial || ""}`.toLowerCase()
    )));
    const templatesToCreate = officialClassTemplates.filter((turma) => (
      !existingKeys.has(`${turma.nome}|${turma.horarioInicial}`.toLowerCase())
    ));

    if (!templatesToCreate.length) {
      notify("As turmas oficiais do instituto já foram criadas.", "warning");
      return;
    }

    await Promise.all(templatesToCreate.map((turma) => addDoc(collection(db, "turmas"), {
      ...turma,
      professor: "Equipe ECJ Manaus",
      userId: state.user.uid,
      organizationId: state.organizationId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })));

    await logAudit("class.seeded", "turmas", "official-templates", { total: templatesToCreate.length });
    await loadAllData();
    notify(`${templatesToCreate.length} turmas oficiais criadas com sucesso.`, "success");
  } catch (error) {
    notify(`Erro ao criar turmas oficiais: ${error.message}`, "error");
  }
}

async function savePresence(studentId, classId, status) {
  if (!can("attendance:write")) {
    notify("Você não tem permissão para registrar presença.", "error");
    return;
  }
  const aluno = state.alunos.find((item) => item.id === studentId);
  const turma = state.turmas.find((item) => item.id === classId);
  if (!aluno || !turma) return;

  const existing = state.presencasHoje.find((item) => item.alunoId === studentId && item.turmaId === classId);

  const payload = {
    alunoId: aluno.id,
    alunoNome: aluno.nome,
    turmaId: turma.id,
    turmaNome: turma.nome,
    status,
    data: getTodayKey(),
    userId: state.user.uid,
    organizationId: state.organizationId,
    updatedAt: serverTimestamp()
  };

  try {
    if (existing) {
      await updateDoc(doc(db, "presencas", existing.id), payload);
    } else {
      await addDoc(collection(db, "presencas"), {
        ...payload,
        createdAt: serverTimestamp()
      });
    }

    await logAudit("attendance.saved", "presencas", existing?.id || aluno.id, {
      alunoNome: aluno.nome,
      turmaNome: turma.nome,
      status
    });
    await loadTodayAttendance();
    renderDashboard();
    renderAttendance();
    notify("Presença registrada.", "success");
  } catch (error) {
    notify(`Erro ao salvar presença: ${error.message}`, "error");
  }
}

async function syncPaymentsForMonth() {
  if (!can("finance:write")) {
    notify("Você não tem permissão para atualizar mensalidades.", "error");
    return;
  }
  if (!state.alunos.length) {
    notify("Cadastre alunos antes de gerar mensalidades.", "warning");
    return;
  }

  try {
    await loadPayments();
    const existingKeys = new Set(state.pagamentos.map((payment) => payment.alunoId));
    const eligibleStudents = state.alunos.filter((aluno) => (
      aluno.status !== "cancelado" && Number(aluno.valorMensalidade || 0) > 0
    ));

    const creates = eligibleStudents
      .filter((aluno) => !existingKeys.has(aluno.id))
      .map((aluno) => addDoc(collection(db, "pagamentos"), {
        alunoId: aluno.id,
        alunoNome: aluno.nome,
        valor: Number(aluno.valorMensalidade || 0),
        vencimento: getDueDateForMonth(state.financeMonth, aluno.diaVencimento || 10),
        status: shouldStartAsLate(state.financeMonth, aluno.diaVencimento, aluno.status) ? "atrasado" : "pendente",
        mesReferencia: state.financeMonth,
        dataPagamento: null,
        userId: state.user.uid,
        organizationId: state.organizationId,
        paymentKey: `${state.organizationId}_${aluno.id}_${state.financeMonth}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));

    await Promise.all(creates);
    const overdueUpdates = state.pagamentos
      .filter((payment) => payment.status === "pendente" && shouldPaymentBeLate(payment.vencimento))
      .map((payment) => updateDoc(doc(db, "pagamentos", payment.id), {
        status: "atrasado",
        updatedAt: serverTimestamp(),
        organizationId: state.organizationId
      }));
    await Promise.all(overdueUpdates);
    await logAudit("payments.synced", "pagamentos", state.financeMonth, {
      mesReferencia: state.financeMonth,
      criadas: creates.length,
      atrasadas: overdueUpdates.length
    });
    await loadPayments();
    renderDashboard();
    renderFinance();
    notify("Mensalidades atualizadas.", "success");
  } catch (error) {
    notify(`Erro ao atualizar mensalidades: ${error.message}`, "error");
  }
}

async function updatePaymentStatus(paymentId, status) {
  if (!can("finance:write")) {
    notify("Você não tem permissão para alterar pagamentos.", "error");
    return;
  }
  const payment = state.pagamentos.find((item) => item.id === paymentId);
  if (!payment) return;

  try {
    await updateDoc(doc(db, "pagamentos", paymentId), {
      status,
      dataPagamento: status === "pago" ? serverTimestamp() : null,
      reciboNumero: status === "pago" ? payment.reciboNumero || generateReceiptNumber(payment) : null,
      pagoPor: status === "pago" ? state.user.email || state.user.uid : null,
      updatedAt: serverTimestamp(),
      userId: state.user.uid,
      organizationId: state.organizationId
    });

    const aluno = state.alunos.find((item) => item.id === payment.alunoId);
    if (aluno) {
      let nextStatus = aluno.status;
      if (status === "atrasado") nextStatus = "inadimplente";
      if (status === "pago" && aluno.status === "inadimplente") nextStatus = "ativo";
      await updateDoc(doc(db, "alunos", aluno.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        userId: state.user.uid,
        organizationId: state.organizationId
      });
    }

    await logAudit("payment.status_updated", "pagamentos", paymentId, {
      alunoNome: payment.alunoNome,
      status
    });
    await loadAllData();
    notify("Pagamento atualizado.", "success");
  } catch (error) {
    notify(`Erro ao atualizar pagamento: ${error.message}`, "error");
  }
}

function chargeStudentOnWhatsapp(studentId) {
  const aluno = state.alunos.find((item) => item.id === studentId);
  if (!aluno) return;
  openWhatsappCharge(aluno.whatsapp || aluno.responsavelTelefone, aluno.nome, aluno.valorMensalidade);
}

function chargePaymentOnWhatsapp(paymentId) {
  const payment = state.pagamentos.find((item) => item.id === paymentId);
  const aluno = state.alunos.find((item) => item.id === payment?.alunoId);
  if (!payment || !aluno) return;
  openWhatsappCharge(aluno.whatsapp || aluno.responsavelTelefone, payment.alunoNome, payment.valor);
}

function openWhatsappCharge(phone, studentName, value) {
  const normalizedPhone = normalizeBrazilPhone(phone);
  if (!normalizedPhone) {
    notify("Cadastre um WhatsApp ou telefone do responsável para este aluno.", "warning");
    return;
  }

  const message = `Olá, tudo bem? Aqui é do CT. Estamos passando para lembrar sobre a mensalidade do aluno ${studentName}, no valor de R$ ${formatCurrency(value).replace("R$ ", "").replace("R$ ", "")}. Qualquer dúvida estamos à disposição.`;
  window.open(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}

function openModal(id) {
  $(`#${id}`).classList.remove("is-hidden");
  document.body.classList.add("modal-open");
}

function closeModal(id) {
  $(`#${id}`).classList.add("is-hidden");
  document.body.classList.remove("modal-open");
}

function ensureFirebaseConfig() {
  if (isFirebaseConfigured) return true;
  notify("Configure o firebaseConfig em js/firebase.js antes de usar autenticação e banco de dados.", "error");
  return false;
}

function can(permission) {
  const role = state.profile?.role || "professor";
  const permissions = rolePermissions[role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

async function logAudit(action, entity, entityId, details = {}) {
  if (!state.user || !state.organizationId) return;

  try {
    await addDoc(collection(db, "auditLogs"), {
      action,
      entity,
      entityId,
      details,
      organizationId: state.organizationId,
      userId: state.user.uid,
      userEmail: state.user.email || "",
      role: state.profile?.role || "",
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Falha ao registrar auditoria", error);
  }
}

function notify(message, type = "info") {
  const root = $("#toastRoot");
  if (!root) {
    alert(message);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  root.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4600);
}

function generateInviteCode() {
  return `ECJ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function setStaticDateLabels() {
  $("#todayLabel").textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date());
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return new Date(value).getTime() || 0;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function getDueDateForMonth(month, day) {
  const [year, monthIndex] = month.split("-").map(Number);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return `${month}-${pad(Math.min(Number(day || 10), lastDay))}`;
}

function shouldStartAsLate(month, day, studentStatus) {
  if (studentStatus === "inadimplente") return true;
  const dueDate = new Date(`${getDueDateForMonth(month, day)}T23:59:59`);
  return dueDate < new Date();
}

function shouldPaymentBeLate(dueDate) {
  if (!dueDate) return false;
  return new Date(`${dueDate}T23:59:59`) < new Date();
}

function generateReceiptNumber(payment) {
  const baseName = String(payment.alunoNome || "ECJ").replace(/\W/g, "").slice(0, 3).toUpperCase() || "ECJ";
  return `${state.financeMonth.replace("-", "")}-${baseName}-${Date.now().toString().slice(-5)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function sumBy(items, field) {
  return items.reduce((total, item) => total + Number(item[field] || 0), 0);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${dateString}T00:00:00Z`));
}

function formatAuditDate(value) {
  const millis = getTimestampMillis(value);
  if (!millis) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(millis));
}

function labelAuditAction(action) {
  const labels = {
    "student.created": "Aluno criado",
    "student.updated": "Aluno atualizado",
    "student.deleted": "Aluno excluído",
    "class.created": "Turma criada",
    "class.updated": "Turma atualizada",
    "class.deleted": "Turma excluída",
    "class.seeded": "Turmas oficiais criadas",
    "attendance.saved": "Presença registrada",
    "payments.synced": "Mensalidades atualizadas",
    "payment.status_updated": "Pagamento atualizado",
    "user.role_updated": "Perfil alterado"
  };
  return labels[action] || action || "Ação";
}

function normalizeBrazilPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function labelStatus(status = "ativo") {
  const labels = {
    ativo: "Ativo",
    inadimplente: "Inadimplente",
    trancado: "Trancado",
    cancelado: "Cancelado"
  };
  return labels[status] || "Ativo";
}

function labelPayment(status = "pendente") {
  const labels = {
    pago: "Pago",
    pendente: "Pendente",
    atrasado: "Atrasado"
  };
  return labels[status] || "Pendente";
}

function labelPresence(status = "presente") {
  const labels = {
    presente: "Presente",
    falta: "Falta",
    atraso: "Atraso",
    reposicao: "Reposição"
  };
  return labels[status] || "Presente";
}

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "CT";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
