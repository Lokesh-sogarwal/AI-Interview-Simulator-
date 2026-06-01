# Software Requirements Specification (SRS)

## 1. Introduction

### 1.1 Purpose
This document defines the requirements for the AI Interview Simulator web application. The system helps users upload a resume, receive AI-driven analysis, save the resume for later use, and practice interview sessions that are tailored to the saved resume. The goal is to combine resume review, mock interviewing, and feedback in a single workflow that is easy to use and suitable for job seekers.

### 1.2 Product Scope
The product is a browser-based platform built with Next.js and MongoDB. It supports account-based usage, resume processing, interview setup, scoring, and feedback. The application also stores the user’s saved resume so the interview flow can reuse the same version later. This reduces repeated uploads and allows the system to generate more personalized interview questions.

### 1.3 Intended Audience
This SRS is intended for developers, testers, reviewers, project stakeholders, and anyone who needs to understand how the platform should behave. It also serves as a planning reference for future features and system maintenance.

### 1.4 Definitions
- **ATS:** Applicant Tracking System. In this project, it refers to a scoring approach used to judge resume quality and keyword coverage.
- **Resume profile:** AI-generated analysis results, including suggestions and scoring.
- **Saved resume:** The final version stored in the database for reuse during interviews.
- **Interview session:** An interactive practice session that uses resume data to generate questions and feedback.

## 2. Overall Description

### 2.1 Product Perspective
The application is a standalone web product with server-rendered and client-side sections. The landing page introduces the service, while authenticated users can access the resume checker, interview setup flow, dashboard, and feedback pages. The resume checker is the entry point for most users and connects the upload, analysis, save, and interview steps.

### 2.2 User Classes
- **Job seekers:** Users preparing for real interviews who need feedback and practice.
- **Students:** Users with limited interview experience who want guided practice.
- **Early-career professionals:** Users looking to improve their resume and answer quality.
- **Repeat users:** Users who return to reuse a saved resume and review prior feedback.

### 2.3 Operating Environment
- Modern web browsers on desktop and mobile devices
- Next.js application runtime
- MongoDB database for persistence
- AI provider access through server-side API routes

### 2.4 Assumptions
- Users can upload valid resume files in supported formats.
- An AI provider is available for resume scoring and interview generation.
- MongoDB is configured correctly in production.
- Users access the application through a browser.

## 3. System Goals and Objectives
The system is designed to achieve the following:
1. Simplify resume review with AI-based feedback.
2. Help users improve resumes using actionable suggestions.
3. Save the user’s best resume version for future interview sessions.
4. Generate interview questions that reflect the user’s background.
5. Provide feedback and performance history in a dashboard.
6. Reduce the time needed to prepare for mock interviews.

## 4. Functional Requirements

### 4.1 Authentication and Access Control
4.1.1 The system shall allow users to sign up, sign in, and sign out.

4.1.2 The system shall maintain secure authentication state using cookies.

4.1.3 The system shall restrict personalized pages to authenticated users.

4.1.4 The system shall allow anonymous access only to public landing pages.

### 4.2 Resume Upload and Input
4.2.1 Users shall be able to upload resume files in PDF, DOC, and DOCX formats.

4.2.2 The system shall extract readable text from the uploaded file.

4.2.3 The system shall allow manual resume text entry or paste input.

4.2.4 The system shall provide a file preview or text preview after upload.

4.2.5 The system shall preserve the uploaded content for later analysis and saving.

### 4.3 Resume Preview and Editing
4.3.1 Users shall be able to preview the uploaded resume before saving.

4.3.2 The preview shall support the original uploaded file or extracted text.

4.3.3 Users shall be able to edit extracted text before saving it.

4.3.4 Users shall be able to view AI suggestions alongside the resume text.

### 4.4 Resume Analysis and ATS Scoring
4.4.1 The system shall send resume text to the resume profile API.

4.4.2 The system shall generate an ATS-style score.

4.4.3 The system shall produce improvement suggestions.

4.4.4 Suggestions shall be editable before the resume is saved.

4.4.5 The analysis result shall be shown to the user in a readable interface.

### 4.5 Resume Persistence
4.5.1 The system shall save the resume in the database for the authenticated user.

4.5.2 The system shall store resume text, ATS results, and update timestamps.

4.5.3 The system shall retrieve the saved resume later for interview setup.

4.5.4 The system shall update the saved resume when the user saves a newer version.

### 4.6 Interview Setup and Execution
4.6.1 The system shall use the saved resume when preparing an interview session.

4.6.2 The system shall generate personalized interview questions from the resume.

4.6.3 The system shall allow users to proceed through a guided setup flow.

4.6.4 The system shall store interview responses and results for later review.

### 4.7 Feedback and Dashboard
4.7.1 The system shall display interview history to the user.

4.7.2 The system shall show feedback summaries and key performance indicators.

4.7.3 The system shall allow the user to revisit a past interview session.

4.7.4 The system shall present a clear summary of improvement areas.

## 5. Non-Functional Requirements

### 5.1 Performance
- Resume upload and analysis should complete within a practical time for normal file sizes.
- The dashboard and interview setup pages should load without unnecessary delay.

### 5.2 Security
- Authentication secrets shall remain server-side and protected.
- Database writes shall be restricted to authenticated users.
- Resume content shall be handled securely and only shared with the logged-in account.

### 5.3 Reliability
- Saved resume data must be durable and recoverable.
- The app should handle temporary AI provider failures gracefully.
- If analysis fails, the system should show a useful error message.

### 5.4 Usability
- The interface should be simple, responsive, and readable.
- Users should understand the flow from upload to save to interview.
- Buttons, labels, and status messages should be clear.

### 5.5 Maintainability
- Server routes and UI components should remain modular.
- The codebase should be easy to extend with future features.
- Shared logic should be centralized where appropriate.

## 6. System Architecture Summary
The platform follows a web application architecture with three main layers:

### 6.1 Presentation Layer
The user interface is implemented in React components and Next.js pages. It includes the landing page, authenticated home page, resume checker modal, interview setup page, dashboard, and feedback views.

### 6.2 Application Layer
The application layer consists of Next.js API routes that handle resume upload, resume profile generation, resume save/load, interview creation, and feedback generation.

### 6.3 Data Layer
MongoDB stores user data, saved resumes, interview history, and feedback records.

## 7. External Interfaces

### 7.1 API Endpoints
- `POST /api/resume` — upload and extract resume text
- `POST /api/resume/profile` — generate ATS score and suggestions
- `POST /api/resume/save` — persist resume data for the user
- `GET /api/resume/saved` — retrieve saved resume data

### 7.2 User Interface Views
- Public landing page
- Authenticated home page
- Resume checker modal
- Interview setup page
- Active interview page
- Dashboard and feedback views

## 8. Data Requirements
The system shall store at minimum:
- User identifier and profile details
- Resume text and saved version timestamp
- ATS score and suggestion list
- Interview session metadata
- User answers and AI feedback
- Summary scores and progress history

## 9. Detailed Use Cases

### 9.1 Use Case: Upload and Preview Resume
1. The user opens the resume checker.
2. The user uploads a PDF, DOC, or DOCX file, or pastes text manually.
3. The system extracts resume text.
4. The system displays a preview and enables analysis.
5. The user can verify the text before saving.

### 9.2 Use Case: Analyze Resume and Save It
1. The user requests analysis.
2. The system sends the text to the AI profile endpoint.
3. The system displays ATS score and suggestions.
4. The user edits the content if needed.
5. The user saves the final version.
6. The system stores the data in MongoDB.

### 9.3 Use Case: Start Interview from Saved Resume
1. The user opens the interview setup page.
2. The system loads the saved resume from the database.
3. The system stores the resume locally for the interview session.
4. Interview questions are generated from the saved resume.
5. The user begins answering the questions.

### 9.4 Use Case: Review Feedback
1. The user completes an interview session.
2. The system saves responses and scoring information.
3. The user opens the dashboard or feedback page.
4. The system shows a summary of strengths and improvement areas.

## 10. Acceptance Criteria
The project will be considered acceptable when:
- Resume upload works for supported file types.
- Resume preview is available before final save.
- ATS analysis produces scores and suggestions.
- Saved resume data is loaded back from the database.
- Interview setup uses the saved resume rather than an empty session.
- Feedback and history are visible to authenticated users.

## 11. Constraints and Risks
- AI output quality may vary depending on the model and the prompt.
- Resume parsing quality depends on the structure of the uploaded file.
- Large files may require more time to extract and analyze.
- Missing environment variables can prevent database or AI features from working.

## 12. Future Enhancements
- Drag-and-drop upload area
- Better file preview for PDFs and DOCX files
- More advanced ATS scoring and keyword matching
- Export of resume analysis and interview reports
- Role-specific question templates
- Analytics for improvement over time

## 13. Conclusion
The AI Interview Simulator is a complete interview preparation platform that combines resume analysis, persistent storage, interview practice, and feedback. The requirements in this document support the current system and provide a strong foundation for future development.
