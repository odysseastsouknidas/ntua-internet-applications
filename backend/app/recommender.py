from app.database import get_connection
from app.schemas import RecommendationInput
from scipy.stats import pearsonr
import math


def find_overlapping_users(user_ratings: RecommendationInput):

    # We first need to find the movies rated by the user in the Request Body
    movies_rated = set()
    for in_rating in user_ratings.ratings:
        movies_rated.add(in_rating.movieId)

    # Then we need to identify the users with overlapping rated movies (and also keep those movies along with the rating)
    placeholders = ",".join(["?"] * len(movies_rated))  # It creates the correct number of ? in the query

    connection = get_connection()
    cursor = connection.cursor()

    query = f"""
    SELECT userId, movieId, rating
    FROM ratings
    WHERE movieId IN ({placeholders})
    """

    cursor.execute(query, tuple(movies_rated))
    result = cursor.fetchall()
    connection.close()

    overlapping_users = {}
    for row in result:
        user_id = row[0]
        movie_id = row[1]
        rating = row[2]

        # if it is the first time we find the user
        if user_id not in overlapping_users:
            overlapping_users[user_id] = []

        # either way we add the rating in the user's list
        overlapping_users[user_id].append({
            "movieId": movie_id,
            "rating": rating
        })

    return overlapping_users

def compute_similarities(user_ratings: RecommendationInput, overlapping_users, k: int = 30):

    # We collect user u's ratings
    u_ratings = {}
    for in_rating in user_ratings.ratings:
        u_ratings[in_rating.movieId] = in_rating.rating

    similarities = {}

    for user_id, shared_ratings in overlapping_users.items():
        # In order to compute Pearson correlation, for each overlapping user
        # we need to have the 2 vectors with u and v's ratings of their common movies
        u_values = []
        v_values = []

        # We iterate over the v user's ratings
        for item in shared_ratings:
            movie_id = item["movieId"]
            
            # In the end: i-th position in both vectors corresponds to the same movie.
            if movie_id in u_ratings: # we ignore the non-common movies
                u_values.append(u_ratings[movie_id])
                v_values.append(item["rating"])

        # Finally compute Pearson Correlation
        if len(u_values) < 2:
            similarities[user_id] = 0
        else:
            similarities[user_id] = pearsonr(u_values, v_values).statistic

    # Then select the top-K most similar users.
    valid = []
    for uid, sim in similarities.items():
        # skip NaN similarities
        if isinstance(sim, float) and math.isnan(sim):
            continue
        valid.append((uid, sim))

    # sort by similarity (descending) and take top K
    valid.sort(key=lambda x: x[1], reverse=True) # x[1] is the similiarity score
    top_k = dict(valid[:k])

    return top_k


def fetch_user_averages(user_ratings: RecommendationInput, overlapping_users):
    # Average rating for the request user u 
    # We assume the user isn't already in the DB
    u_total = 0
    for in_rating in user_ratings.ratings:
        u_total += in_rating.rating
    u_average = u_total / len(user_ratings.ratings)

    # Average rating for every overlapping user v
    user_ids = list(overlapping_users.keys())
    v_averages = {}

    if user_ids:
        placeholders = ",".join(["?"] * len(user_ids))

        connection = None
        try:
            connection = get_connection()
            cursor = connection.cursor()

            query = f"""
            SELECT userId, AVG(rating)
            FROM ratings
            WHERE userId IN ({placeholders})
            GROUP BY userId
            """

            cursor.execute(query, tuple(user_ids))
            result = cursor.fetchall()

            for row in result:
                user_id = row[0]
                average_rating = row[1]
                v_averages[user_id] = average_rating
        finally:
            if connection:
                connection.close()

    return u_average, v_averages


def predict_candidate_ratings(user_ratings: RecommendationInput,
                              overlapping_users,
                              top_k: dict,
                              u_average: float,
                              v_averages: dict,
                              n: int = 10):
    """Predict ratings for candidate movies (not rated by the request user).

    - `top_k` is a dict mapping neighbor userId -> similarity (signed float).
    - `u_average` is the request user's mean rating.
    - `v_averages` maps neighbor userId -> their mean rating (full history).
    Returns a list of up to `n` recommendation dicts with keys: movieId, title, genres, predictedRating.
    """

    # Build set of movieIds rated by the request user
    movies_rated_by_u = {r.movieId for r in user_ratings.ratings}

    neighbor_ids = list(top_k.keys())
    if not neighbor_ids:
        return []

    # Fetch all ratings for these neighbors, then filter out movies already rated by u
    placeholders = ",".join(["?"] * len(neighbor_ids))
    connection = get_connection()
    cursor = connection.cursor()
    query = f"SELECT userId, movieId, rating FROM ratings WHERE userId IN ({placeholders})"
    cursor.execute(query, tuple(neighbor_ids))
    rows = cursor.fetchall()
    connection.close()

    # candidate_ratings: movieId -> list of (v, rating)
    candidate_ratings = {}
    for row in rows:
        v_id, movie_id, rating = row[0], row[1], row[2]
        # Skip movies user u has rated
        if movie_id in movies_rated_by_u:
            continue
        candidate_ratings.setdefault(movie_id, []).append((v_id, rating))

    # Compute predicted rating for each candidate movie
    predictions = []
    for movie_id, votes in candidate_ratings.items():
        num = 0.0
        denom = 0.0
        for v_id, r_vi in votes:
            if v_id not in top_k:
                continue
            sim = top_k[v_id]
            # require neighbor mean to be available
            if v_id not in v_averages:
                continue
            rv_mean = v_averages[v_id]
            num += sim * (r_vi - rv_mean)
            denom += abs(sim)

        # If there are no others users that have rated this movie, we ignore this movie from the recommendations
        if denom == 0:
            continue
        else:
            pred = u_average + (num / denom)

        predictions.append((movie_id, pred))

    if not predictions:
        return []

    # Keep top-n by predicted rating
    predictions.sort(key=lambda x: x[1], reverse=True)
    top_preds = predictions[:n]

    # Fetch metadata for these movies
    movie_ids = [p[0] for p in top_preds]
    placeholders = ",".join(["?"] * len(movie_ids))
    connection = get_connection()
    cursor = connection.cursor()
    query = f"SELECT movieId, title, genres FROM movies WHERE movieId IN ({placeholders})"
    cursor.execute(query, tuple(movie_ids))
    rows = cursor.fetchall()
    connection.close()

    meta = {row[0]: (row[1], row[2]) for row in rows}

    recs = []
    for movie_id, pred in top_preds:
        title, genres = meta.get(movie_id, (None, None))
        recs.append({
            "movieId": movie_id,
            "title": title,
            "genres": genres,
            "predictedRating": round(pred, 2)
        })

    return recs


def get_recommendation(user_ratings: RecommendationInput):
    overlapping_users = find_overlapping_users(user_ratings)        # We have a dictionary: userId -> List of (movie, rating)
    similarities = compute_similarities(user_ratings, overlapping_users)        # We now have a dict: userId --> similarity (for k most similar users)
    u_average, v_averages = fetch_user_averages(user_ratings, overlapping_users)    # We now have the average rating given by each relevant user
    recommendations = predict_candidate_ratings(
        user_ratings=user_ratings,
        overlapping_users=overlapping_users,
        top_k=similarities,
        u_average=u_average,
        v_averages=v_averages,
    )

    return {
        "status": "success",
        "recommendations": recommendations
    }
