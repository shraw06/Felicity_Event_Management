Part 2 Features implemented:

Tier A:
Merchandise Payment Approval Workflow
QR Scanner & Attendance Tracking

Tier B:
Real-Time Discussion Forum
Organizer Password Reset Workflow

Tier C:
Anonymous Feedback System




---

## Table of Contents

1. [Tech Stack & Library Justifications](#tech-stack--library-justifications)
   - [Backend Libraries](#backend-libraries)
   - [Frontend Libraries](#frontend-libraries)
   - [Development Tools](#development-tools)
2. [Feature Deep-Dives by Tier](#feature-deep-dives-by-tier)
   - [Tier A – Merchandise Payment Approval Workflow](#tier-a--merchandise-payment-approval-workflow)
   - [Tier A – QR Scanner & Attendance Tracking](#tier-a--qr-scanner--attendance-tracking)
   - [Tier B – Real-Time Discussion Forum](#tier-b--real-time-discussion-forum)
   - [Tier B – Organizer Password Reset Workflow](#tier-b--organizer-password-reset-workflow)
   - [Tier C – Anonymous Feedback System](#tier-c--anonymous-feedback-system)
3. [Setup & Installation](#setup--installation)

---

## Tech Stack & Library Justifications

### Backend Libraries

| Library / Module | Version | Justification |
|---|---|---|
| **express** | ^4.18.2 | Minimal, battle-tested Node.js web framework. Chosen for its ubiquitous middleware ecosystem and straightforward routing. Its unopinionated structure fits the varied feature set (REST + WebSocket) without imposing a rigid pattern. |
| **mongoose** | ^8.1.0 | ODM for MongoDB. Provides schema definition and validation directly in code, which enforces data contracts (e.g., `formFields` sub-schema, `EventRegistration` payment enums) without a separate migration layer. Population, virtuals, and the built-in `Map` type were actively used across models. |
| **socket.io** | ^4.8.3 | Full-duplex communication library. Required for the real-time discussion forum: room-based message broadcasting, acknowledgements, and a Socket.IO–specific middleware chain for JWT authentication on connection. Chosen over raw WebSockets because it handles reconnection, rooms, and namespaces transparently. |
| **jsonwebtoken** | ^9.0.0 | Stateless authentication via signed JWTs. Each actor type (participant, organizer, admin) receives a JWT on login. The token is verified by role-specific middleware (`protectParticipant`, `protectOrganizer`, `protectAdmin`) on every protected route. Stateless tokens eliminate session-store overhead. |
| **bcryptjs** | ^2.4.3 | Password hashing with configurable salt rounds. Used instead of the native `crypto` module because bcrypt's work-factor makes brute-force attacks computationally expensive. Applied on account creation and validated on every login for all actor types. |
| **nodemailer** | ^6.9.4 | SMTP email dispatch. Powers three transactional email flows: (1) registration ticket delivery with an embedded QR image attachment, (2) merchandise purchase confirmation, and (3) organizer password-reset credential delivery. Configured via environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) to remain transport-agnostic. |
| **qrcode** | ^1.5.1 | QR code generation. Converts a JSON payload (`{ ticketId, eventId, participantId }`) into a PNG data-URL that is stored as a `Buffer` in MongoDB and embedded in the confirmation email. Server-side generation ensures the QR is produced once and stored, not regenerated on every retrieval request. |
| **uuid** | ^9.0.0 | Globally unique ticket ID generation. Each registration and merchandise order receives a UUID v4 as `ticketId`. UUIDs are collision-resistant without a database round-trip, which matters because the ticket ID is also the payload encoded in the QR code. |
| **multer** | ^2.0.2 | Multipart form-data handling for file uploads. Used specifically for the merchandise payment-proof upload flow. Stores files on disk under `backend/uploads/` and provides the relative URL that is persisted to `EventRegistration.paymentProofUrl`. |
| **cors** | ^2.8.5 | Cross-Origin Resource Sharing headers. The frontend (Vite dev server on a different port, or a deployed domain) is a distinct origin from the Express API. `cors()` is applied globally so all routes accept cross-origin requests without per-route boilerplate. |
| **dotenv** | ^16.4.1 | Loads `.env` into `process.env` at startup. Keeps secrets (Mongo URI, JWT secret, SMTP credentials) out of source control and makes the app configurable across environments without code changes. |
| **axios** | ^1.13.5 | HTTP client used in the backend for any outbound HTTP requests. Provides a consistent promise-based API with interceptors, mirroring the frontend usage and reducing cognitive switching cost. |

### Frontend Libraries

| Library / Module | Version | Justification |
|---|---|---|
| **react** | ^19.2.0 | UI library. The component model maps cleanly to the multi-actor dashboard structure (ParticipantDashboard, OrganizerDashboard, AdminDashboard each composed of focused sub-components). Hooks (`useState`, `useEffect`, `useRef`) are used pervasively instead of class components. |
| **react-dom** | ^19.2.0 | React's DOM renderer. Required peer dependency for React 19; renders the root component tree into `index.html`. |
| **react-router-dom** | ^7.13.0 | Client-side routing. `BrowserRouter` + `Routes`/`Route` provide declarative URL-to-component mapping. `useNavigate` is used for programmatic post-login redirection; `useParams` reads dynamic path segments (`:id` in event and ticket routes). |
| **axios** | ^1.13.5 | HTTP client. A single axios instance is created in `api.js` with the base URL from `VITE_API_URL` and a request interceptor that injects `Authorization: Bearer <token>` automatically, removing the need to pass the token manually at every call site. |
| **socket.io-client** | ^4.8.3 | Browser-side Socket.IO. Must match the server version to ensure protocol compatibility. Used by `Forum.jsx` and `NotificationBell.jsx` to connect, join event-scoped rooms, and receive real-time message and notification events. |
| **fuse.js** | ^7.1.0 | Lightweight fuzzy-search library. Powers the participant event-browser search: a `Fuse` instance is initialised on the client-side events array and searches across `name`, `description`, and `event_tags` fields. Avoids a round-trip API call per keystroke and gives instant, typo-tolerant results. |
| **html5-qrcode** | ^2.3.8 | Camera-based QR code scanning in the browser. Used in `OrganizerAttendance.jsx` to activate the device camera, decode QR codes in real time, and feed the decoded `ticketId` to the backend scan endpoint. Chosen over raw `getUserMedia` + canvas decoding because it handles multi-format decoding and camera lifecycle management out of the box. |

### Development Tools

| Tool | Version | Justification |
|---|---|---|
| **vite** (rolldown-vite) | 7.2.5 | Next-generation build tool replacing Create React App. Native ESM dev server gives near-instant HMR; Rollup-based production builds are significantly smaller than webpack. The `rolldown-vite` variant uses the Rolldown bundler engine for further build-speed improvements. |
| **@vitejs/plugin-react** | ^5.1.1 | Vite plugin that adds React Fast Refresh and JSX transformation, enabling sub-100 ms component hot reloads during development. |
| **nodemon** | ^3.0.3 | Development-only process monitor. Watches backend source files and restarts the Node server automatically on change, removing the manual kill-and-restart cycle during active backend development. |
| **concurrently** | ^8.2.2 | Root-level tool that runs `npm run server` and `npm run client` in parallel from a single terminal window with a single `npm run dev` command from the project root. |
| **eslint** + plugins | ^9.39.1 | Static analysis. `eslint-plugin-react-hooks` enforces the Rules of Hooks; `eslint-plugin-react-refresh` catches components that would break Fast Refresh. Catches category of bugs before they reach runtime. |

---

## Feature Deep-Dives by Tier

### Tier A – Merchandise Payment Approval Workflow

#### Justification for Feature Selection
Merchandise events require a manual payment step (bank transfer / UPI) where proof must be submitted and reviewed. An automated payment gateway would add external dependency and compliance scope; a manual image-upload workflow keeps the system self-contained while still providing a verifiable paper trail.

#### Design Choices & Implementation Approach
- **State machine on `EventRegistration`**: The `payment_status` field is an enum (`awaiting_payment → pending_approval → successful / rejected`). This finite-state model prevents illegal transitions and makes status queries predictable.
- **Multer for file upload**: Payment proof (screenshot / UPI receipt) is uploaded as multipart form-data to `POST /events/orders/:orderId/payment-proof`. Multer writes the file to `backend/uploads/` and records the relative URL on the registration document, keeping binary data out of MongoDB.
- **Organizer approval dashboard**: `OrganizerPayments.jsx` fetches all pending proofs and presents approve / reject actions. On approval, `payment_status` flips to `successful`, a QR ticket is generated, and a confirmation email is dispatched. On rejection, an optional `rejectionReason` is stored and surfaced to the participant.
- **Email notification**: `nodemailer` sends a purchase confirmation with an embedded QR code after approval, mirroring the normal-event registration email pattern for consistency.

#### Technical Decisions
- Storing the file URL (not the binary) in MongoDB keeps document size small and delegates file serving to Express's `express.static` middleware on the `/uploads` route.
- Orders are a separate concept from direct registrations: `createOrder` sets `payment_status: 'awaiting_payment'` so the participant can upload proof at any time before the organizer reviews it, decoupling the two steps.
- The `updateOrderStatus` controller validates the status transition server-side to prevent participants from self-approving by calling the endpoint directly with a spoofed payload.

---

### Tier A – QR Scanner & Attendance Tracking

#### Justification for Feature Selection
Physical event attendance verification requires a fast, contactless check-in mechanism. A QR code per ticket is the industry-standard approach: it is generatable server-side, readable by any camera, and encodes enough context (ticketId + eventId + participantId) to be verified without exposing a secret.

#### Design Choices & Implementation Approach
- **Server-side QR generation**: `qrcode.toDataURL()` runs on the backend at registration time, converts the JSON payload to a PNG, and stores the binary in MongoDB as a `Buffer`. The participant retrieves it via `GET /events/registrations/:regId/ticket`, which returns the base64-encoded image ready for display or printing.
- **Browser-side scanning**: `html5-qrcode` in `OrganizerAttendance.jsx` activates the device camera and decodes QR codes in real time. The decoded text is parsed as JSON and the `ticketId` is sent to `POST /events/:id/scan`.
- **Scan controller logic**: The backend verifies that the `ticketId` belongs to the event, that the registration status is `UPCOMING` (not cancelled), and records `firstScanAt`, `scannedBy`, and a full `scanHistory` array so repeated scans are detected and flagged as duplicates rather than silently accepted.
- **Manual override**: Organizers can mark attendance manually (with a reason) via `POST /events/registrations/:regId/manual-attendance`, stored in a `manualOverrides` array. This covers cases where a participant's phone camera fails.
- **CSV export**: `GET /events/:id/attendance/export` streams a CSV with per-participant scan details, making the attendance log portable for post-event reporting.

#### Technical Decisions
- Storing `ticketQr` as a `Buffer` in MongoDB keeps the ticket self-contained with its registration record, avoiding a second filesystem lookup on retrieval.
- Dual-tracking via `firstScanAt` (fast scalar query) and `scanHistory` (full audit array) lets organizers quickly see first-entry time while retaining the complete re-entry log for fraud detection.
- The scan endpoint returns a `duplicate: true` flag (not an error code) on re-scan, so the scanner UI displays a yellow warning instead of a red error, prompting human judgement rather than applying a hard block.

---

### Tier B – Real-Time Discussion Forum

#### Justification for Feature Selection
Participants need a channel to ask questions, share updates, and interact with the organizer around an event. Email threads and static comment boards do not convey the immediacy of live events. A real-time, per-event forum eliminates polling overhead and keeps conversation contextually scoped.

#### Design Choices & Implementation Approach
- **Socket.IO rooms**: Each event gets a dedicated room (`event:<eventId>`). Clients join on component mount (`Forum.jsx`) and leave on unmount. Messages, reactions, pins, and deletions are all emitted to the room so every connected member receives updates instantly.
- **JWT authentication on socket connection**: The `authenticateSocket` middleware in `socketHandler.js` reads `socket.handshake.auth.token`, verifies it with `jsonwebtoken`, resolves the actor (participant or organizer), and attaches `senderId`, `senderRole`, and `senderName` to `socket.data`. Every subsequent event from that socket is tied to a verified identity.
- **Threaded replies**: The `Message` model has a `parentId` field. Top-level messages have `parentId: null`; replies reference their parent's `_id`. The frontend groups replies under their parent for display.
- **Emoji reactions**: Each message has a `reactions` Map (`emoji → [userId]`). The `handleReactMessage` handler toggles the user's ID in the array (add if absent, remove if present) and broadcasts the updated reactions object to the room.
- **Pinned messages**: Organizers can set `pinned: true` on any message. The forum UI sorts pinned messages to the top.
- **Organizer moderation**: `handleDeleteMessage` checks that the sender is the message author or has `senderRole === 'organizer'` before allowing deletion. Deleted messages cascade-delete all descendant replies using a BFS traversal to avoid orphaned children.
- **In-app notifications**: The `Notification` model stores per-participant notification records. When a reply is posted, the backend creates notifications for the parent-message author and the organizer. `NotificationBell.jsx` listens on a user-specific room (`user:<userId>`) for new notification events and displays a live badge count.

#### Technical Decisions
- Socket.IO was chosen over Server-Sent Events (SSE) because the forum requires bi-directional communication: clients both send (messages, reactions) and receive updates. SSE is receive-only.
- The `Message` model stores replies as separate top-level documents (not embedded arrays) to keep each document small and avoid MongoDB's 16 MB document-size limit on high-traffic events.
- REST endpoints (`GET /forum/:eventId/messages`) are retained alongside Socket.IO so the initial page load fetches message history efficiently via HTTP, and real-time updates arrive via the socket without re-fetching all history on every reconnect.

---

### Tier B – Organizer Password Reset Workflow

#### Justification for Feature Selection
Organizers receive system-generated credentials from the admin and have no self-service recovery path. A formal request → admin-approval workflow is more appropriate than a public "forgot password" link because organizer accounts have elevated privileges and credential control should remain with the platform admin.

#### Design Choices & Implementation Approach
- **Request model**: `OrganizerPasswordReset` stores `organizerId`, `reason`, `status` (`pending / approved / rejected`), `adminNote`, and timestamps, providing a full audit trail.
- **Organizer side**: A "Request Password Reset" form in `OrganizerDashboardContent.jsx` lets the organizer submit a reason. The request is posted to `POST /organizers/reset-request`.
- **Admin side**: `AdminPasswordResetRequests.jsx` lists all pending requests with approve / reject actions and an optional note field. On approval, the backend generates a new random password, hashes it, updates the organizer's record, and emails the new plaintext credential to the organizer's contact address.
- **Status visibility**: Organizers can view their own request history (`GET /organizers/my-reset-requests`) and see whether each request is pending, approved, or rejected, along with any admin note.

#### Technical Decisions
- The new password is generated server-side using `crypto.randomBytes` and is never included in the API response — only emailed directly to the organizer. The admin cannot retrieve the plaintext password after approval.
- Keeping reset requests in a persistent collection (rather than short-lived tokens) provides a searchable audit trail for admins.
- Rejected requests surface the admin's note to the organizer so they understand why and can resubmit with additional context.

---

### Tier C – Anonymous Feedback System

#### Justification for Feature Selection
Post-event quality assessment requires candid participant responses. Named feedback discourages honest negative ratings. Enforcing one submission per participant (without revealing identity in query results) balances anonymity with spam prevention.

#### Design Choices & Implementation Approach
- **Anonymity mechanism**: The `Feedback` model stores `participantId` solely to enforce one-submission-per-participant uniqueness via a unique compound index on `{ eventId, participantId }`. The `participantId` is never returned in organizer-facing API responses — it is projected out at the aggregation/query level.
- **Feedback structure**: Each record stores a numeric `rating` (1–5) and an optional free-text `comment`. A star-rating UI in `EventDetail.jsx` uses controlled React state for the hover and selection interaction.
- **Organizer analytics**: `GET /events/:id/feedback/summary` aggregates average rating, rating-distribution histogram, and total count via a MongoDB aggregation pipeline — all computation is done in the database, not in application memory.
- **Organizer detail view**: `GET /events/:id/feedback` returns comments with ratings but without participant identity. Results support rating-based filtering and pagination via query parameters.
- **CSV export**: `GET /events/:id/feedback/export` streams a CSV for offline analysis.
- **One-way edit**: Participants can update (but not delete) their own feedback via `findOneAndUpdate`, preserving record integrity.

#### Technical Decisions
- The uniqueness constraint is enforced at the database level (MongoDB unique index) rather than only in application code, preventing race-condition duplicate submissions.
- Returning `participantId` in any organizer-facing response was deliberately avoided. The pipeline projects it out so even a compromised API token cannot de-anonymise respondents.
- Feedback is gated on registration status both in the UI (`registered === true`) and server-side — the backend verifies registration before accepting a submission, preventing non-attendees from skewing ratings.

---

## Setup & Installation

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- A **MongoDB Atlas** cluster (or a local MongoDB instance on port 27017)
- An SMTP server or relay (Gmail App Password, Mailtrap, SendGrid, etc.) for email features

---

### 1. Clone the Repository

```bash
git clone https://github.com/shraw06/Felicity_Event_Management.git
cd Felicity_Event_Management
```

---

### 2. Backend Environment Variables

Create `backend/.env`:

```env
# MongoDB connection string
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority

# Express server port
PORT=5000

# Runtime environment
NODE_ENV=development

# JWT signing secret — use any long, random string
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d

# SMTP credentials for transactional emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
```

> **Gmail note**: Enable 2-Step Verification, then generate an App Password at myaccount.google.com/apppasswords and use it as `SMTP_PASS`.

---

### 3. Frontend Environment Variables

Create `frontend/src/.env`:

```env
# Base URL of the backend API — no trailing slash
VITE_API_URL=http://localhost:5000/api
```

---

### 4. Install Dependencies

```bash
# From the project root — installs root dev tools (concurrently)
npm install

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

---

### 5. Run the Project

#### Development — both servers in parallel

```bash
# From the project root
npm run dev
```

This uses `concurrently` to start:
- **Backend** — `nodemon server.js` → `http://localhost:5000`
- **Frontend** — Vite dev server → `http://localhost:5173`

#### Run servers individually

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

---

### 6. Access the Application

| Actor | URL |
|---|---|
| Participant (browse & register) | `http://localhost:5173` |
| Organizer login | `http://localhost:5173/organizer/login` |
| Admin login | `http://localhost:5173/admin/login` |

> **First-time admin setup**: Insert an Admin document directly into MongoDB (via Atlas Data Explorer or Compass) in the `admins` collection. The `password` field must be a bcrypt hash (10 rounds) of your chosen password. Once logged in, the Admin creates Organizer accounts through the dashboard — credentials are auto-generated and emailed to the organizer's contact address.

Example admin seed document:
```json
{
  "email": "admin@example.com",
  "password": "<bcrypt-hash-of-your-password>",
  "first_name": "Admin",
  "last_name": "User"
}
```

---

### 7. Production Build (Frontend)

```bash
cd frontend
npm run build
# Output → frontend/dist/
```

Deploy `frontend/dist/` to any static host (Vercel, Netlify, Nginx). Before building, update `VITE_API_URL` in `frontend/src/.env` to your deployed backend URL.

---

### 8. File Upload Directory

Multer writes payment-proof images to `backend/uploads/`, served by Express at `/uploads`. Pre-create the directory if needed:

```bash
mkdir -p backend/uploads
```

In production, replace local disk storage with a cloud bucket (AWS S3, Cloudinary, etc.) and update the Multer storage configuration accordingly.
