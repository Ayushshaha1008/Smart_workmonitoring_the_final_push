# WorkWatch AI: Technical & Functional Documentation

WorkWatch AI is a comprehensive, remote-first employee management and productivity tracking platform. It leverages real-time synchronization, computer vision for identity verification, and a robust administrative backend to ensure operational transparency and secure work environments.

---

## 🚀 Project Overview

The mission of WorkWatch AI is to bridge the "visibility gap" in remote teams. By providing verified attendance, real-time activity monitoring, and integrated communication pathways, it allows organizations to scale distributed operations without losing the accountability of a physical office.

---

## 👥 User Roles & Permissions

The application distinguishes between two primary environments based on the user's role:

### 1. Employee Dashboard
*   **Target Users**: Team members, freelancers, or remote staff.
*   **Key Capabilities**:
    *   **Face-Verified Login**: Mandatory identity check via `face-api.js` before starting work.
    *   **Activity Controls**: Simple interface to "Start Work", "Take Break", and "Stop Work".
    *   **Session Requests**: Ability to request review for missed sessions or tracking discrepancies.
    *   **Live Monitoring Integration**: Automatically shares tracking status and optional snapshots with administration.
    *   **Internal Messaging**: Real-time channel for team collaboration and administrative alerts.
    *   **Direct Audio/Video Calling**: Peer-to-peer WebRTC calling directly from the chat interface.

### 2. Admin/Management Dashboard
*   **Target Users**: Founders, CEOs, HR Managers, or Team Leads.
*   **Key Capabilities**:
    *   **Live Status Monitoring**: Real-time feed of which employees are active, on break, or offline.
    *   **Live WebRTC Monitor**: Initiate a real-time monitor stream of an employee's screen and camera with sub-second latency.
    *   **Productivity Analytics**: View aggregated work hours and historical productivity charts.
    *   **Verification Oversite**: Review face verification status and snapshot history.
    *   **Payroll & Earnings**: Automated wage calculation based on tracked minutes and employee hourly rates.
    *   **Incident Management**: centralized "Alerts" system to handle session approvals and system notifications.

---

## 📞 Communication System (WebRTC)

WorkWatch AI features a high-performance communication engine:
*   **Signaling**: Utilizes Supabase Broadcast channels for peer discovery and ICE candidate exchange.
*   **P2P Connection**: Direct peer-to-peer media streams using WebRTC for zero-latency audio and video calls.
*   **Live Cast**: Specialized monitoring mode where administrators can request a live cast of an employee's shared workspace for real-time guidance or supervision.
*   **Integrated UI**: Initiating calls is seamless via Phone and Video icons within the team chat header.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite |
| **Styling** | Tailwind CSS (Modern, Dark-Theme optimized) |
| **Backend/BaaS** | Supabase (PostgreSQL + Realtime Engine) |
| **Authentication** | Supabase Auth |
| **Computer Vision** | `face-api.js` (TensorFlow.js based) |
| **Real-time Signaling** | Supabase Broadcast Channels |
| **Icons** | Lucide React |

---

## 🔄 Core Application Flows

### Phase 1: Authentication & Role Sorting
1.  Users land on the **Auth** component.
2.  Upon login, `App.tsx` fetches the complete user profile from the `users` table.
3.  The system determines the component to render: `AdminDashboard` or `EmployeeDashboard`.

### Phase 2: The Work Session Cycle (Employee)
1.  **Identity Verification**: The employee must stand before the camera. The `FaceTracker` component compares their current face against their stored "Verification Signature" (Face Descriptor).
2.  **Session Start**: Once verified, the "Start Work Session" button becomes active. Clicking it creates a new entry in the `work_sessions` table.
3.  **Persistence**: The UI enters a "Live Tracking" state, updating the server with snapshots at regular intervals.
4.  **Session Completion**: At the end of the day, users stop the session, which calculates total work minutes for payroll.

### Phase 3: Administrative Oversight
1.  **The Command Center**: Admins see a grid of all registered employees.
2.  **Drill-Down**: Clicking an employee opens a detailed modal with their daily stats, session history, and payment status.
3.  **Real-Time Intervention**: Admins can approve or reject "Session Requests" that appear in the Alerts sidebar.

---

## 📂 Project Structure

*   `/src/App.tsx`: The primary orchestrator handling routing and auth state.
*   `/src/components/EmployeeDashboard.tsx`: Monolithic (modularly designed) component for staff operations.
*   `/src/components/AdminDashboard.tsx`: Management portal with analytics and operational controls.
*   `/src/components/FaceTracker.tsx`: Reusable computer vision module for biometric verification.
*   `/src/supabase.ts`: Supabase client configuration.
*   `/src/types.ts`: Centralized TypeScript definitions for consistent data structures.

---

## 📊 Database Schema Highlights

The system relies on a PostgreSQL database with several critical tables:
*   `users`: Stores profiles, roles (`admin` vs `employee`), hourly rates, and face descriptors.
*   `work_sessions`: Logs every "punch-in" and "punch-out", including break durations.
*   `alerts`: Handles asynchronous notifications (System alerts, session requests).
*   `messages`: Powers the real-time internal team chat.
*   `payments`: Tracks historical payouts and processed earnings.

---

## 🔐 Security & Privacy

*   **Biometric Integrity**: Face descriptors are stored as encrypted vectors, not raw images.
*   **Edge Verification**: Verification happens client-side to ensure low latency and high privacy.
*   **Row Level Security (RLS)**: Supabase policies ensure employees can only see their own data, while admins can view organizational data.

---

*Note: This document reflects the system state following the removal of legacy CRM and Leave Management modules to prioritize core productivity tracking.*
