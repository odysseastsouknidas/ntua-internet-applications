from pydantic import BaseModel

"""
When you inherit from BaseModel, Pydantic automatically validates the fields according to their type annotations.
"""

class NewMovie(BaseModel):
    title: str
    genres: str

class RatingInput(BaseModel):
    movieId: int
    rating: float

class RecommendationInput(BaseModel):
    ratings: list[RatingInput]

# ----------
class TagSearchInput(BaseModel):
    search: str
# ----------
