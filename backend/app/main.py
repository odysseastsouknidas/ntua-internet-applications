from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import NewMovie, RecommendationInput, TagSearchInput
from app.database import get_connection
from app.recommender import get_recommendation

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # In testing environment we allow every origin
    allow_credentials=True,     # Cedentials identify/authenticate the user when making a request (cookies etc)
    allow_methods=["*"],        # Allow ALL HTTP methods
    allow_headers=["*"],        # Allow any request headers
)

@app.get("/health")
def health():
    return {"message": "Hello, we are up"}

@app.get("/db-check")
def db_check():
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT COUNT(*) FROM movies")
    movie_count = cursor.fetchone()[0]  #get one row from the query result
    connection.close()
    return {"movies": movie_count}

@app.get("/movielens/api/movies")
def movie_search(search: str):
    if not search.strip():
        return {"status":"failure", "message":"empty input"}
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        
        # SQLite's LIKE is by default case insensitive
        query = """
        SELECT movieId, title, genres
        FROM movies
        WHERE title LIKE ?
        """
        cursor.execute(query, (f"%{search}%",))
        result = cursor.fetchall()
        movies = []
        for row in result:
            movies.append({
                "movieId": row[0],
                "title": row[1],
                "genres": row[2]
            })
        return {"status": "success", "movies": movies}
    except Exception:
        return {"status": "failure", "message": "database error"}
    finally: # finally ALWAYS runs
        if connection:
            connection.close()

@app.get("/movielens/api/ratings/{movieId}")
def get_rating(movieId: int):
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()

        query = """
        SELECT rating FROM ratings WHERE movieId = ?
        """
        cursor.execute(query, (movieId,))
        result = cursor.fetchall()

        ratings = []
        for row in result:
            ratings.append({
                "rating": row[0]
            })
        return {"status": "success", "ratings": ratings}

    except Exception:
        return {"status": "failure", "message": "database error"}
    finally:
        if connection:
            connection.close()

@app.post("/movielens/api/movies")
def add_movie(mov: NewMovie):
    if not mov.title.strip() or not mov.genres.strip():
        return {"status": "failure", "message": "invalid new movie"}
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()

        helper_query = """
        SELECT MAX(movieId) FROM movies
        """
        cursor.execute(helper_query)

        # We need to make sure the new movie is assigned a unique ID
        result = cursor.fetchone()
        max_id = result[0] if result[0] is not None else 0
        new_id = max_id + 1

        query = """
        INSERT INTO movies (movieId, title, genres) VALUES (?, ?, ?)
        """
        cursor.execute(query, (new_id, mov.title, mov.genres))
        connection.commit()
        return {"status": "success", "movieId": new_id}
    
    except Exception:
        return {"status": "failure", "message": "database error"}
    finally:
        if connection:
            connection.close()

@app.post("/movielens/api/recommendations")
def give_recs(user_ratings: RecommendationInput):
    if not user_ratings.ratings:
        return {"status": "failure", "message": "No user ratings provided"}
    return get_recommendation(user_ratings)

# ----------
@app.post("/movielens/api/tags/movies")
def tag_movie_search(tag_search: TagSearchInput):
    keyword = tag_search.search.strip()
    if not keyword:
        return {"status": "failure", "message": "empty input"}

    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()

        keyword_lower = keyword.lower()

        if len(keyword_lower) < 5:
            query = """
            SELECT movies.movieId, movies.title, movies.genres, MIN(tags.tag)
            FROM tags
            JOIN movies ON tags.movieId = movies.movieId
            WHERE lower(tags.tag) = ?
            GROUP BY movies.movieId, movies.title, movies.genres
            """
            cursor.execute(query, (keyword_lower,))
        else:
            query = """
            SELECT movies.movieId, movies.title, movies.genres, MIN(tags.tag)
            FROM tags
            JOIN movies ON tags.movieId = movies.movieId
            WHERE substr(lower(tags.tag), 1, 5) = ?
            GROUP BY movies.movieId, movies.title, movies.genres
            """
            cursor.execute(query, (keyword_lower[:5],))

        result = cursor.fetchall()

        movies = []
        for row in result:
            movies.append({
                "movieId": row[0],
                "title": row[1],
                "genres": row[2],
                "matchingTag": row[3]
            })

        return {"status": "success", "movies": movies}
    except Exception:
        return {"status": "failure", "message": "database error"}
    finally:
        if connection:
            connection.close()
# ----------
