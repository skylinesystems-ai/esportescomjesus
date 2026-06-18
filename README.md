# Esportes com Jesus Manaus

Sistema web personalizado para o Instituto Esportes com Jesus Manaus, feito com HTML5, CSS3, JavaScript puro, Firebase Auth e Cloud Firestore.

O visual usa a identidade das artes do instituto: fundo preto, destaque vermelho, textos brancos e cards com bordas vermelhas.

## Arquitetura empresarial

O sistema agora trabalha por instituição usando `organizationId`. Cada conta pertence a uma organização e todos os documentos operacionais carregam `organizationId` para permitir equipe, permissões e separação de dados.

Perfis disponíveis:

- `admin`: acesso total, equipe, permissões e auditoria.
- `secretaria`: alunos, turmas, presença e leitura financeira.
- `professor`: alunos/turmas em leitura e check-in de presença.
- `financeiro`: leitura de alunos/turmas e controle financeiro.

No cadastro existe o campo opcional **Código da instituição**. Sem código, o usuário cria uma nova instituição como `admin`. Com código, entra na instituição existente como `professor`, e o admin pode trocar o perfil depois na tela **Config**.

## Horarios oficiais incluidos

### Segunda, quarta e sexta

- Funcional: 8:00
- Kickboxing: 17:00
- Jiu-Jitsu Kids: 18:00
- Funcional: 18:00
- Jiu-Jitsu: 19:00

### Terca e quinta

- Reforco Escolar: 17:30
- Futsal: 17:30
- Jiu-Jitsu: 18:00
- Kickboxing: 19:00
- Funcional: 19:00

Na tela **Turmas**, o botao **Criar turmas oficiais** cadastra essas turmas no Firestore para a conta logada.

## Estrutura

```text
ct-forge/
  index.html
  css/style.css
  js/app.js
  js/firebase.js
  firestore.rules
  firebase.json
  README.md
```

## Configurar Firebase

1. Acesse o [Firebase Console](https://console.firebase.google.com/).
2. Crie um projeto.
3. Em **Authentication**, habilite o provedor **E-mail/senha**.
4. Em **Firestore Database**, crie o banco em modo produção.
5. Em **Configurações do projeto > Seus apps**, crie um app Web.
6. Copie o objeto `firebaseConfig`.
7. Cole os valores em `js/firebase.js`, substituindo:

```js
export const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};
```

## Rodar localmente

Como o projeto usa módulos JavaScript e Firebase via CDN, rode com um servidor local:

```bash
cd ct-forge
python -m http.server 5174
```

Depois abra:

```text
http://localhost:5174
```

Também funciona com qualquer servidor estático simples, como `npx serve`.

## Publicar no Firebase Hosting

Instale e autentique a Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
```

Dentro da pasta `ct-forge`, vincule o projeto e publique:

```bash
firebase use --add
firebase deploy
```

Para publicar apenas hosting e regras:

```bash
firebase deploy --only hosting,firestore:rules
```

## Regras do Firestore

O arquivo `firestore.rules` restringe leitura e escrita por `organizationId` e perfil do usuário. Registros antigos por `userId` ainda podem ser lidos/migrados pelo dono da conta.

Regras centrais:

```js
request.resource.data.organizationId == users/{uid}.organizationId
resource.data.organizationId == users/{uid}.organizationId
```

As ações de escrita são limitadas por perfil: `admin`, `secretaria`, `professor` e `financeiro`. A entrada por convite usa a coleção `inviteCodes`, evitando listar todas as organizações para usuários logados.

## Coleções

### users

- `nome`
- `email`
- `userId`
- `organizationId`
- `role`
- `active`
- `joinedWithInviteCode`
- `createdAt`
- `updatedAt`

### organizations

- `nome`
- `inviteCode`
- `createdBy`
- `createdAt`
- `updatedAt`

### inviteCodes

- `code`
- `organizationId`
- `organizationName`
- `active`
- `createdBy`
- `createdAt`
- `updatedAt`

Essa coleção permite que um novo usuário entre como `professor` quando informar um código válido. A regra permite `get` direto pelo código, mas bloqueia listagem da coleção.

### alunos

- `nome`
- `whatsapp`
- `responsavelNome`
- `responsavelTelefone`
- `turma`
- `modalidade` gerada automaticamente a partir da turma escolhida
- `valorMensalidade`
- `diaVencimento`
- `status`: `ativo`, `inadimplente`, `trancado`, `cancelado`
- `observacoes`
- `dataCadastro`
- `userId`
- `organizationId`
- `createdAt`
- `updatedAt`

### turmas

- `nome`
- `modalidade`
- `professor`
- `diasSemana`
- `horarioInicial`
- `horarioFinal`
- `limiteVagas`
- `valorPadraoMensalidade`
- `userId`
- `organizationId`
- `createdAt`
- `updatedAt`

### presencas

- `alunoId`
- `alunoNome`
- `turmaId`
- `turmaNome`
- `status`: `presente`, `falta`, `atraso`, `reposicao`
- `data`
- `userId`
- `organizationId`
- `createdAt`
- `updatedAt`

### pagamentos

- `alunoId`
- `alunoNome`
- `valor`
- `vencimento`
- `status`: `pago`, `pendente`, `atrasado`
- `mesReferencia`
- `dataPagamento`
- `reciboNumero`
- `pagoPor`
- `paymentKey`
- `userId`
- `organizationId`
- `createdAt`
- `updatedAt`

### auditLogs

- `action`
- `entity`
- `entityId`
- `details`
- `organizationId`
- `userId`
- `userEmail`
- `role`
- `createdAt`

## Fluxo financeiro

1. Cadastre alunos com valor de mensalidade e dia de vencimento.
2. Abra a tela **Financeiro**.
3. Escolha o mês.
4. Clique em **Atualizar mês**.
5. O sistema gera mensalidades faltantes para os alunos ativos/trancados/inadimplentes que possuem valor acima de zero.
6. Marque cada mensalidade como paga, pendente ou atrasada.

Ao marcar como `pago`, o sistema gera `reciboNumero`, salva `pagoPor` e registra auditoria.

## WhatsApp

Alunos inadimplentes e mensalidades atrasadas exibem o botão **Cobrar no WhatsApp**. O link abre:

```text
https://wa.me/55NUMERO?text=MENSAGEM
```

Mensagem usada:

```text
Olá, tudo bem? Aqui é do CT. Estamos passando para lembrar sobre a mensalidade do aluno {nome}, no valor de R$ {valor}. Qualquer dúvida estamos à disposição.
```

## Próximas melhorias

- Relatórios em PDF.
- Importação de alunos por planilha.
- Multiunidade e permissões por perfil.
- Planos recorrentes automáticos por aluno.
- Notificações agendadas no WhatsApp.
- Histórico individual de presença e financeiro.
- Filtros avançados por turma, modalidade e status.
- Dashboard com gráficos mensais.
