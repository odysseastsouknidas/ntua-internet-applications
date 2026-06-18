# Backend Setup and Execution

This backend is implemented with FastAPI and SQLite for the MovieLens assignment.

## Prerequisites

- Python 3.12
- `pip`

The commands below are written for macOS and other Unix-like systems.

## Backend Structure

- `app/`: FastAPI application code
- `data/ml-latest-small/`: MovieLens dataset files
- `data/movielens.db`: SQLite database created by the initialization script
- `scripts/init_db.py`: creates and populates the SQLite database
- `requirements.txt`: Python dependencies

## Setup

From the `backend/` directory, create and activate a virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
```

Install the required packages:

```bash
pip install -r requirements.txt
```

## Initialize the Database

Before initializing the database, make sure the MovieLens `ml-latest-small` dataset is present in `backend/data` (the expected path from the repository root is `backend/data/ml-latest-small/`).

Then run the database initialization script:

```bash
python3 scripts/init_db.py
```

This creates `data/movielens.db` and loads the contents of:

- `movies.csv`
- `ratings.csv`
- `tags.csv`

## Run the Backend

Start the FastAPI server from the `backend/` directory:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 3000
```

The API base URL is:

```text
http://127.0.0.1:3000/movielens/api
```

## Available Endpoints

- `GET /movielens/api/movies?search={keyword}`
- `GET /movielens/api/ratings/{movieId}`
- `POST /movielens/api/movies`
- `POST /movielens/api/recommendations`
- `POST /movielens/api/tags/movies`

## Example Requests

Search movies:

```bash
curl "http://127.0.0.1:3000/movielens/api/movies?search=toy"
```

Get ratings for a movie:

```bash
curl "http://127.0.0.1:3000/movielens/api/ratings/1"
```

Add a new movie:

```bash
curl -X POST "http://127.0.0.1:3000/movielens/api/movies" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Movie",
    "genres": "Drama|Romance"
  }'
```

Get recommendations:

```bash
curl -X POST "http://127.0.0.1:3000/movielens/api/recommendations" \
  -H "Content-Type: application/json" \
  -d '{
    "ratings": [
      { "movieId": 1, "rating": 4.5 },
      { "movieId": 32, "rating": 5.0 }
    ]
  }'
```

Search movies by tag:

```bash
curl -X POST "http://127.0.0.1:3000/movielens/api/tags/movies" \
  -H "Content-Type: application/json" \
  -d '{
    "search": "pixar"
  }'
```

## Notes

- CORS is enabled in the backend.
- Ratings sent to `/recommendations` are used only for that request and are not stored in the database.
- If you want to stop using the virtual environment, run:

```bash
deactivate
```
