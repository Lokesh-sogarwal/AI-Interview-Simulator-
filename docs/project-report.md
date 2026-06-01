# Project Report and Cost Estimation

## 1. Executive Summary
The AI Interview Simulator is a browser-based platform that combines resume analysis, AI-assisted interview practice, and feedback tracking into a single workflow. The application allows a user to upload a resume, preview the content, review ATS-style suggestions, save the resume to a database, and then use that saved version to generate personalized interview questions. The project is designed to help job seekers prepare faster and more effectively while keeping the experience simple and interactive.

## 2. Project Background
Preparing for interviews usually involves several disconnected steps: reviewing a resume, checking missing keywords, practicing common questions, and keeping track of feedback. This project brings those tasks together. Instead of using separate tools, the user can upload a resume once, improve it, store it, and reuse it for mock interviews. The platform focuses on convenience, persistence, and practical feedback.

## 3. Project Objectives
The main objectives of the project are:
1. Provide a clean resume upload and preview experience.
2. Generate useful ATS-style insights from the resume.
3. Let the user save the improved resume for future sessions.
4. Use the saved resume to personalize interview questions.
5. Store interview feedback so users can review progress.
6. Create a polished, modern interface for repeated practice.

## 4. Scope of Implementation
The current implementation includes the following areas:
- Authentication and protected routes
- Resume upload and text extraction
- Resume preview and edit support
- ATS scoring and suggestion generation
- Database save/load functionality for the resume
- Interview setup that reuses the saved resume
- Dashboard and feedback flows
- AI-driven question generation and evaluation

The project does not currently include live human interviewers, video conferencing, or ATS integration with external job boards.

## 5. System Architecture Overview
The application follows a modern web architecture with three primary layers.

### 5.1 Presentation Layer
The front end is built with Next.js, React, TypeScript, and Tailwind CSS. It contains the landing page, authenticated home page, resume checker modal, interview setup page, and dashboard screens.

### 5.2 Application Layer
The application layer uses Next.js App Router API routes to handle upload, analysis, save/load, interview setup, and feedback generation. This layer validates input, processes requests, and communicates with the database and AI provider.

### 5.3 Data Layer
MongoDB stores user profiles, saved resumes, interview records, and feedback history. This ensures that resume data and practice history remain available between sessions.

## 6. Functional Delivery Summary
The core user flow is already in place:
1. The user signs in.
2. The user uploads or pastes a resume.
3. The system extracts text and shows a preview.
4. The system produces an ATS score and improvement suggestions.
5. The user saves the resume to the database.
6. The interview setup page loads the saved resume.
7. The system creates interview questions from the saved content.
8. The user completes the interview and receives feedback.

## 7. Detailed Module Breakdown

### 7.1 Authentication Module
This module handles sign in, sign out, and protected access to user-specific features. Cookie-based sessions ensure that a user’s saved resume and interview history stay associated with the correct account.

### 7.2 Resume Upload Module
The user can upload PDF, DOC, or DOCX files, or manually paste resume text. The system extracts content for processing and display. A preview area allows the user to confirm the uploaded resume before saving.

### 7.3 Resume Analysis Module
The resume analysis module sends the extracted text to an AI endpoint that returns a score and suggestions. The score helps users understand how well their resume may match an ATS-like screening process. Suggestions can include missing keywords, weak summaries, and formatting improvements.

### 7.4 Save and Retrieval Module
The save flow persists the resume to MongoDB, including the score and analysis details. The retrieval flow allows the system to load the saved resume later, especially when preparing an interview.

### 7.5 Interview Preparation Module
The interview setup page loads the saved resume automatically and stores it locally for the current session. This lets the interview generator create more relevant questions based on the user’s actual background.

### 7.6 Feedback and Dashboard Module
Interview answers and summary feedback are presented in the dashboard and feedback screens. This gives the user a way to compare attempts, review learning points, and track improvement.

## 8. Technology Stack
- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Next.js App Router API routes
- Database: MongoDB
- Authentication: JWT cookie sessions
- AI: Hugging Face with OpenAI fallback
- Parsing: PDF/document text extraction libraries

## 9. Estimated Development Effort
The project was estimated at approximately 76 hours of development effort.

### 9.1 Effort Breakdown
| Module | Estimated Hours |
|---|---:|
| Discovery and planning | 6 |
| UI and responsive pages | 12 |
| Resume upload and preview | 10 |
| ATS analysis integration | 10 |
| Resume save/load APIs | 8 |
| Interview setup integration | 8 |
| Dashboard and feedback flow | 10 |
| Testing and bug fixing | 8 |
| Deployment and documentation | 4 |
| **Total** | **76 hours** |

## 10. Cost Estimation

### 10.1 Development Cost
Using a blended engineering rate of **$25/hour**:

- Lower estimate: 60 hours × $25 = **$1,500**
- Expected estimate: 76 hours × $25 = **$1,900**
- Higher estimate: 90 hours × $25 = **$2,250**

Using an approximate rate of **₹2,000/hour**:

- Lower estimate: 60 hours × ₹2,000 = **₹120,000**
- Expected estimate: 76 hours × ₹2,000 = **₹152,000**
- Higher estimate: 90 hours × ₹2,000 = **₹180,000**

### 10.2 Monthly Operating Cost
These costs are approximate for a small production deployment.

| Item | Estimated Monthly Cost |
|---|---:|
| Vercel hosting | $0–$20 |
| MongoDB Atlas | $0–$25 |
| AI API usage | $20–$150 |
| Domain and extras | $1–$10 |
| **Total** | **$21–$205** |

## 11. Development Value and Business Impact
The project provides measurable value by improving workflow efficiency. It can reduce resume review time by approximately **40–60%** through AI suggestions. It can reduce interview setup time by **30–50%** because users reuse their saved resume instead of re-uploading content. It also encourages regular practice because users can repeatedly return to the same saved profile and feedback history.

## 12. Testing and Validation Summary
The system should be validated through the following checks:
- Resume upload must accept supported file formats.
- Text extraction must return content for analysis.
- Resume preview must show uploaded or pasted content.
- Analysis must return a score and suggestions.
- Save/load must persist resume data in MongoDB.
- Interview setup must prefer the saved resume.
- Dashboard and feedback pages must remain accessible.

## 13. Risks and Assumptions
Several risks affect the project:
- AI output may vary by model quality and prompt design.
- Resume parsing may be imperfect for complex layouts.
- High AI usage can increase operational cost.
- Database and environment variables must be configured correctly.
- Large or scanned files may need extra processing support.

## 14. Future Enhancements
Recommended improvements include:
- Drag-and-drop resume upload
- Better PDF and DOCX preview rendering
- File validation and size limits
- Richer ATS scoring rules
- Exportable interview reports
- More detailed analytics in the dashboard
- Role-based interview templates

## 15. Conclusion
The AI Interview Simulator is a practical and extensible platform for interview preparation. It delivers a full cycle from resume upload to interview feedback and provides a strong foundation for additional AI and dashboard features in the future.
