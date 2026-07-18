# Architecture Design: ArtFreeGuide

## 1. System Overview
ArtFreeGuide is a web-based AI audio guide that transforms the user can use in museums to get professional-grade art explanations and interactively dive deeper into the context of a piece of art.

## 2. Technology Stack
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **AI Engine**: Gemini 1.5 Flash/Pro (via Google AI Studio API)
- **TTS (Text-to-Speech)**: Web Speech API (Client-side, Browser Native)
- **Deployment**: Vercel (Frontend & Serverless Functions)

## 3. Data Flow
1. **Input**: User enters `Work Title` and `Artist Name` in the UI.
2. **Request**: Frontend sends this data to `/api/chat` (Next.js Route Handler).
3. **AI Processing**: 
    - The API calls Gemini API with a specialized "Museum Curator" system prompt.
    - The AI retrieves information and generates a structured guide text.
4. **Response**: The generated text is returned to the frontend.
5. **Audio Output**: The frontend passes the text to the `Web Speech API` for immediate voice playback.
6. **Interaction**: User asks follow-up questions $\rightarrow$ repeat step 2 with conversation history.

## 4. Prompt Engineering (The "Curator" Persona)
To ensure high-quality, professional guides, the AI will be instructed as follows:
- **Role**: A world-class museum curator who is passionate, knowledgeable, and accessible.
- **Tone**: Elegant, sophisticated, yet easy to understand. Avoids overly academic jargon unless explained.
- **Structure**:
    1. **Introduction**: Emotional hook and the significance of the work.
    2. **Analysis**: Visual details, historical context, and the artist's intent.
    3. **Conclusion**: A thought-provoking question to encourage the user to look closer at the art.
- **Constraint**: If the work is unknown, the AI should honestly state it but provide general context about the artist or period.

## 5. Feature Implementation Details

### 5.1. Voice Synthesis (TTS)
- Use `window.speechSynthesis`.
- Implementation of a `useTTS` hook to handle:
    - `speak(text)`: Convert text to speech.
    - `stop()`: Stop current playback.
    - `setVoice(voice)`: Allow users to choose between available system voices.

### 5.2. Context Management
- Store the current session's conversation in a local state (or local storage) to allow "deep-dive" questions.
- Send the last 5-10 exchanges to the AI to maintain context.

### 5.3. Related Works Recommendation
- In the final part of the initial explanation, the AI is prompted to suggest 2-3 related works (similar style, same artist, or opposing movement) to encourage further exploration.

## 6. Environment & Security
- **API Keys**: Stored in `.env.local` and accessed only on the server-side (`/api`).
- **Rate Limiting**: Implement simple client-side throttling to prevent API overuse.
