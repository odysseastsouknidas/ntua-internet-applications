import csv
import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "ml-latest-small"
DB_PATH = BASE_DIR / "data" / "movielens.db"

def load_movies(cursor):
    with open(DATA_DIR / "movies.csv", newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)   # This reads each row as dictionary
        # We then need to create the tuples that need to be inserted in the DB
        rows = [
            (int(row["movieId"]), row["title"], row["genres"])
            for row in reader
        ]

    cursor.executemany(
        "INSERT INTO movies (movieId, title, genres) VALUES (?, ?, ?)",
        rows,
    )


def load_ratings(cursor):
    with open(DATA_DIR / "ratings.csv", newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        rows = [
            (
                int(row["userId"]),
                int(row["movieId"]),
                float(row["rating"]),
                int(row["timestamp"]),
            )
            for row in reader
        ]

    cursor.executemany(
        "INSERT INTO ratings (userId, movieId, rating, timestamp) VALUES (?, ?, ?, ?)",
        rows,
    )


def load_tags(cursor):
    with open(DATA_DIR / "tags.csv", newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        rows = [
            (
                int(row["userId"]),
                int(row["movieId"]),
                row["tag"],
                int(row["timestamp"]),
            )
            for row in reader
        ]

    cursor.executemany(
        "INSERT INTO tags (userId, movieId, tag, timestamp) VALUES (?, ?, ?, ?)",
        rows,
    )


def main():
    # Make sure the data/ directory exists
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Open a connection to the SQLite database
    connection = sqlite3.connect(DB_PATH)
    connection.execute("PRAGMA foreign_keys = ON")
    cursor = connection.cursor()

    # Re load the DB from scratch
    cursor.execute("DROP TABLE IF EXISTS ratings")
    cursor.execute("DROP TABLE IF EXISTS tags")
    cursor.execute("DROP TABLE IF EXISTS movies")

    cursor.execute("""
        CREATE TABLE movies (
            movieId INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            genres TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            movieId INTEGER NOT NULL,
            rating REAL NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (movieId) REFERENCES movies(movieId)
        )
    """)

    cursor.execute("""
        CREATE TABLE tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            movieId INTEGER NOT NULL,
            tag TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (movieId) REFERENCES movies(movieId)
        )
    """)

    load_movies(cursor)
    load_ratings(cursor)
    load_tags(cursor)

    # We need to permanently save all database changes
    connection.commit()
    connection.close()

    print(f"Database created at {DB_PATH}")


# Run main() only when this file is executed directly, not when it is imported as a module
if __name__ == "__main__":
    main()
