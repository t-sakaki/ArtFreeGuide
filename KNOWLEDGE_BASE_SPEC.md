# Specification: ArtFreeGuide Knowledge Base System

## 1. Overview
Transition the application from a "stateless generation tool" to a "stateful knowledge base." Instead of generating a guide from scratch on every request, the system will store high-quality guides in a database, allowing for asset accumulation, caching, and iterative improvement via user feedback.

## 2. Data Model (Schema)
The system will use a structured storage (e.g., Cloudflare D1 / SQLite) to manage artwork guides.

### Table: `artworks`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID/INT (PK) | Unique identifier for the artwork |
| `title` | TEXT | Artwork title (Normalized for search) |
| `artist` | TEXT | Artist name |
| `location` | TEXT | Museum or gallery where it is housed |
| `year` | TEXT | Creation date/period |
| `guide_short` | TEXT | Short explanation (AI generated) |
| `guide_standard` | TEXT | Standard explanation (AI generated) |
| `guide_deep` | TEXT | Deep dive explanation (AI generated) |
| `created_at` | DATETIME | Timestamp of initial generation |
| `updated_at` | DATETIME | Timestamp of last update/correction |

### Table: `artwork_images`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID/INT (PK) | Unique identifier for the image |
| `artwork_id` | INT (FK) | Reference to `artworks.id` |
| `url` | TEXT | Image URL |
| `is_primary` | BOOLEAN | Whether this is the main display image |
| `is_valid` | BOOLEAN | User-verified status (True/False) |
| `added_at` | DATETIME | Timestamp when image was added |

### Table: `feedback`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID/INT (PK) | Unique identifier for feedback |
| `artwork_id` | INT (FK) | Reference to `artworks.id` |
| `type` | TEXT | Type: 'content_quality', 'image_validity', 'fact_correction' |
| `score` | INT | Rating (e.g., 1-5) or binary (Good/Bad) |
| `comment` | TEXT | Detailed user feedback |
| `created_at` | DATETIME | Timestamp of feedback |

## 3. Functional Workflow

### 3.1. Guide Retrieval Flow
1. User enters artwork/artist.
2. System queries `artworks` table for an existing match.
3. **If match found**: Return stored guides and images immediately.
4. **If no match**: 
   - Call AI to generate guides and search for images.
   - Save results to `artworks` and `artwork_images` tables.
   - Return generated content.

### 3.2. Image Management
- Store multiple images per artwork.
- Allow users to report a "Broken Link" or "Incorrect Image" $\rightarrow$ update `is_valid = false`.
- Trigger a re-search for images when `is_valid` count drops below a threshold.

### 3.3. Feedback Loop
- User can rate the quality of the explanation.
- Feedback is stored in `feedback` table.
- High-negative feedback triggers a "re-generation" task for the AI to improve the content.

## 4. API Requirements
- `GET /api/guide?work=...&artist=...`: Unified entry point (DB Search $\rightarrow$ Generation $\rightarrow$ Store).
- `POST /api/feedback`: Submit rating or report image errors.
- `POST /api/images/verify`: Mark an image as valid/invalid.

## 5. Infrastructure
- **Database**: Cloudflare D1 (SQL) for persistence.
- **Backend**: Cloudflare Workers (Next.js Route Handlers).
