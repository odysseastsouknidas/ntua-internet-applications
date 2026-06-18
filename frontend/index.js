const State = class {
    #data;
    #render;        // Reference to the render function

    constructor(renderFn) {
        this.#render = renderFn;
        this.#data = {
            addMovieTitle: "",              // the text currently associated with adding a movie title
            addMovieGenres: ["", ""],       // the genre input values currently associated with adding a movie
            // ----------
            tagSearchKeyword: "",           // the text currently associated with tag-based movie search
            tagSearchResults: [],           // the list of movies returned by the tag-search endpoint
            // ----------
            searchKeyword: "",              // the text currently associated with movie search
            searchResults: [],              // the list of movies returned by the search endpoint
            showAllSearchResults: false,    // controls whether all matching search results are shown or only the first few
            currentSection: "addMovie",     // the main section currently visible on the page
            averageKeyword: "",             // the text currently associated with average rating search
            averageMovieCandidates: [],     // matching movies shown when the average-rating search returns more than one result
            selectedAverageMovie: null,     // the movie whose average rating is currently being displayed
            rateKeyword: "",                // the text currently associated with rating a movie
            rateValue: "",                  // the rating value currently chosen by the user
            rateMovieCandidates: [],        // matching movies shown when the rate-movie search returns more than one result
            sessionRatings: [],             // the ratings the current browser user has chosen during this session (not stored permanently in the DB)
            movieAverages: {},              // stores average ratings for movies whose ratings have already been fetched
            recommendations: [],            // The movies returned by the recommendations endpoint
            message: "",                    // message shown to the user
            messageType: "",                // type of message, such as success or error
            messageSection: ""              // section where the current message should be shown
        };
    }

    // This returns a copy. Real changes only happen through the setData function.
    getData() {
        return structuredClone(this.#data);     
    }

    setData(newData) {
        this.#data = newData;
        this.#render();         // When states changes, we render again
    }
};

window.addEventListener("load", () => {
    const baseURL = "http://127.0.0.1:3000/movielens/api";
    let state;

    const setMessage = (message, messageType, messageSection) => {
        const data = state.getData();
        data.message = message;
        data.messageType = messageType;
        data.messageSection = messageSection;
        state.setData(data);
    };

    const readAddMovieFormValues = () => {
        const data = state.getData();
        const titleInput = document.getElementById("new-movie-title");
        const genreInputs = document.getElementsByClassName("new-movie-genre-input");

        if (titleInput) {
            data.addMovieTitle = titleInput.value;
        }

        if (genreInputs.length > 0) {
            data.addMovieGenres = Array.from(genreInputs, (input) => input.value);
        }

        return data;
    };

    const renderAddMovieGenreInputs = () => {
        const data = state.getData();
        let html = "";

        for (const [index, genre] of data.addMovieGenres.entries()) {
            html += `
                <input
                    type="text"
                    class="new-movie-genre-input"
                    id="new-movie-genre-${index}"
                    value="${genre}"
                    placeholder="Genre ${index + 1}"
                >
            `;
        }

        return html;
    };

    const addMovie = async (title, genres) => {
        try {
            const response = await fetch(`${baseURL}/movies`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    title: title,
                    genres: genres
                })
            });

            const body = await response.json();

            if (!response.ok || body.status !== "success") {
                setMessage("The movie could not be added. Please check the title and genres and try again.", "error", "addMovie");
                return;
            }

            setMessage(`Movie "${title}" added successfully.`, "success", "addMovie");
        } catch (error) {
            setMessage("Something went wrong while adding the movie. Please try again.", "error", "addMovie");
        }
    };

    // ----------
    const searchMoviesByTag = async (keyword) => {
        try {
            const response = await fetch(`${baseURL}/tags/movies`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    search: keyword
                })
            });

            const body = await response.json();

            if (!response.ok || body.status !== "success") {
                setMessage("The tag-based movie search could not be loaded. Please try again.", "error", "tagSearch");
                return;
            }

            const data = state.getData();
            data.tagSearchKeyword = keyword;
            data.tagSearchResults = body.movies;
            state.setData(data);

            if (body.movies.length === 0) {
                setMessage(`No movies were found for the tag search "${keyword}".`, "error", "tagSearch");
                return;
            }

            setMessage(`Tag search completed for "${keyword}".`, "success", "tagSearch");
        } catch (error) {
            setMessage("Something went wrong while searching movies by tag. Please try again.", "error", "tagSearch");
        }
    };
    // ----------

    const searchMovies = async (keyword) => {
        try {
            const response = await fetch(`${baseURL}/movies?search=${encodeURIComponent(keyword)}`);
            const body = await response.json();

            if (!response.ok || body.status !== "success") {
                setMessage("The movies could not be loaded. Please try again.", "error", "search");
                return;
            }

            const data = state.getData();
            data.searchKeyword = keyword;
            data.searchResults = body.movies;
            data.showAllSearchResults = false;
            state.setData(data);

            if (body.movies.length === 0) {
                setMessage(`No movies were found for "${keyword}".`, "error", "search");
                return;
            }

            setMessage(`Search completed for "${keyword}".`, "success", "search");
        } catch (error) {
            setMessage("Something went wrong while searching for movies. Please try again.", "error", "search");
        }
    };

    // Helper function that hits the Search Endpoint.
    // It is used when the user asks for average ratings for a movie or try to rate a movie
    // because more than one movie may match the user's input title
    const findCandidateMovies = async (keyword, messageSection) => {
        try {
            const response = await fetch(`${baseURL}/movies?search=${encodeURIComponent(keyword)}`);
            const body = await response.json();

            if (!response.ok || body.status !== "success") {
                setMessage("The movies could not be loaded. Please try again.", "error", messageSection);
                return null;
            }

            return body.movies;
        } catch (error) {
            setMessage("Something went wrong while searching for movies. Please try again.", "error", messageSection);
            return null;
        }
    };

    const fetchAverageRating = async (movie) => {
        try {
            const response = await fetch(`${baseURL}/ratings/${movie.movieId}`);
            const body = await response.json();

            if (!response.ok || body.status !== "success") {
                setMessage(`The average rating for "${movie.title}" could not be loaded.`, "error", "average");
                return;
            }

            if (body.ratings.length === 0) {
                const data = state.getData();
                data.selectedAverageMovie = null;
                data.averageMovieCandidates = [];
                state.setData(data);
                setMessage(`No ratings were found for "${movie.title}".`, "error", "average");
                return;
            }

            let total = 0;

            for (const item of body.ratings) {
                total += item.rating;
            }

            const average = total / body.ratings.length;

            const data = state.getData();
            data.movieAverages[movie.movieId] = average.toFixed(2);
            data.selectedAverageMovie = movie;
            data.averageMovieCandidates = [];           // We clear the list of candidate movies
            state.setData(data);
            setMessage(`Average rating loaded for "${movie.title}".`, "success", "average");
        } catch (error) {
            setMessage(`Something went wrong while loading the average rating for "${movie.title}".`, "error", "average");
        }
    };

    const handleAverageMovieSearch = async (keyword) => {
        const movies = await findCandidateMovies(keyword, "average");

        if (movies === null) {
            return;
        }

        const data = state.getData();
        data.averageKeyword = keyword;
        data.averageMovieCandidates = [];   // We reset the average rating search in state 
        data.selectedAverageMovie = null;

        if (movies.length === 0) {
            state.setData(data);
            setMessage(`No movies were found for "${keyword}".`, "error", "average");
            return;
        }

        if (movies.length === 1) {
            data.selectedAverageMovie = movies[0];
            state.setData(data);
            await fetchAverageRating(movies[0]);
            return;
        }

        data.averageMovieCandidates = movies;
        state.setData(data);
        setMessage(`More than one movie matched "${keyword}". Please choose one.`, "success", "average");
    };

    const saveSessionRating = (movie, rating) => {
        const data = state.getData();
        const existingRating = data.sessionRatings.find((item) => item.movieId === movie.movieId);

        if (existingRating) {
            existingRating.rating = rating;
        } else {
            data.sessionRatings.push({
                movieId: movie.movieId,
                title: movie.title,
                rating: rating
            });
        }

        data.rateMovieCandidates = [];          // We clear the Candidate Movies so they don't get rendered again
        state.setData(data);
        setMessage(`Your rating for "${movie.title}" was saved.`, "success", "rate");
    };

    const handleRateMovieSearch = async (keyword, rating) => {
        const movies = await findCandidateMovies(keyword, "rate");

        if (movies === null) {
            return;
        }

        const data = state.getData();
        data.rateKeyword = keyword;
        data.rateValue = rating;
        data.rateMovieCandidates = [];

        if (movies.length === 0) {
            state.setData(data);
            setMessage(`No movies were found for "${keyword}".`, "error", "rate");
            return;
        }

        if (movies.length === 1) {
            state.setData(data);
            saveSessionRating(movies[0], parseFloat(rating));
            return;
        }

        data.rateMovieCandidates = movies;
        state.setData(data);
        setMessage(`More than one movie matched "${keyword}". Please choose one.`, "success", "rate");
    };

    const getRecommendations = async () => {
        const data = state.getData();

        if (data.sessionRatings.length === 0) {
            data.recommendations = [];          // We clear the state's recommendations
            state.setData(data);
            setMessage("Please rate at least one movie before asking for recommendations.", "error", "recommendations");
            return;
        }

        const requestBody = {
            ratings: data.sessionRatings.map((item) => {
                return {
                    movieId: item.movieId,
                    rating: item.rating
                };
            })
        };

        try {
            const response = await fetch(`${baseURL}/recommendations`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(requestBody)
            });

            const body = await response.json();

            if (!response.ok || body.status !== "success") {
                data.recommendations = [];      // We clear the state's recommendations
                state.setData(data);
                setMessage("The recommendations could not be loaded. Please try again.", "error", "recommendations");
                return;
            }

            data.recommendations = body.recommendations;
            state.setData(data);

            if (body.recommendations.length === 0) {
                setMessage("Not enough information was available to generate recommendations from your ratings.", "error", "recommendations");
                return;
            }

            setMessage("Recommendations loaded successfully.", "success", "recommendations");
        } catch (error) {
            data.recommendations = [];      // We clear the state's recommendations
            state.setData(data);
            setMessage("Something went wrong while loading recommendations. Please try again.", "error", "recommendations");
        }
    };


    const renderMessage = (sectionName) => {
        const data = state.getData();

        if (!data.message || data.messageSection !== sectionName) {
            return "";
        }

        return `<p class="message ${data.messageType}">${data.message}</p>`;
    };

    // ----------
    const renderTagSearchResults = () => {
        const data = state.getData();

        if (data.tagSearchResults.length === 0) {
            return "<p>No tag-search results.</p>";
        }

        let rows = "";

        for (const movie of data.tagSearchResults) {
            rows += `
                <tr>
                    <td>${movie.title}</td>
                    <td>${movie.genres.replaceAll("|", ", ")}</td>
                    <td>${movie.matchingTag}</td>
                </tr>
            `;
        }

        return `
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Genres</th>
                        <th>Matching Tag</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    };
    // ----------

    const renderSearchResults = () => {
        const data = state.getData();

        if (data.searchResults.length === 0) {
            return "<p>No search results.</p>";
        }

        // If it is false => show the first 20 results ONLY (it is false by default)
        const moviesToRender = data.showAllSearchResults
            ? data.searchResults
            : data.searchResults.slice(0, 20);

        let rows = "";

        for (const movie of moviesToRender) {
            rows += `
                <tr>
                    <td>${movie.title}</td>
                    <td>${movie.genres.replaceAll("|", ", ")}</td>
                </tr>
            `;
        }

        return `
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Genres</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            ${data.searchResults.length > 20 && !data.showAllSearchResults
                ? '<button type="button" id="show-all-results-button">Show All Results</button>'
                : ""
            }
        `;
    };

    const renderAverageRating = () => {
        const data = state.getData();

        let html = `
            <label for="average-search-input">Movie Title</label>
            <input type="text" id="average-search-input" value="${data.averageKeyword}" placeholder="Search by title">
            <button type="button" id="average-search-button">Find Movie</button>
        `;

        if (data.averageMovieCandidates.length > 0) {
            let rows = "";

            for (const [index, movie] of data.averageMovieCandidates.entries()) {
                rows += `
                    <tr>
                        <td>${movie.title}</td>
                        <td>${movie.genres.replaceAll("|", ", ")}</td>
                        <td><button type="button" class="choose-average-movie-button" data-index="${index}">Choose</button></td>
                    </tr>
                `;
            }

            html += `
                <p>Choose the correct movie:</p>
                <table>
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Genres</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
        }

        if (data.selectedAverageMovie) {
            const average = data.movieAverages[data.selectedAverageMovie.movieId];

            html += `
                <p><strong>Movie:</strong> ${data.selectedAverageMovie.title}</p>
                <p><strong>Average Rating:</strong> ${average !== undefined ? average : "-"}</p>
            `;
        }

        return html;
    };

    const renderRateMovie = () => {
        const data = state.getData();

        let html = `
            <label for="rate-search-input">Movie Title</label>
            <input type="text" id="rate-search-input" value="${data.rateKeyword}" placeholder="Search by title">
            <label for="rate-value-select">My Rating</label>
            <select id="rate-value-select">
                <option value="">Select</option>
                <option value="0.5" ${data.rateValue === "0.5" ? "selected" : ""}>0.5</option>
                <option value="1.0" ${data.rateValue === "1.0" ? "selected" : ""}>1.0</option>
                <option value="1.5" ${data.rateValue === "1.5" ? "selected" : ""}>1.5</option>
                <option value="2.0" ${data.rateValue === "2.0" ? "selected" : ""}>2.0</option>
                <option value="2.5" ${data.rateValue === "2.5" ? "selected" : ""}>2.5</option>
                <option value="3.0" ${data.rateValue === "3.0" ? "selected" : ""}>3.0</option>
                <option value="3.5" ${data.rateValue === "3.5" ? "selected" : ""}>3.5</option>
                <option value="4.0" ${data.rateValue === "4.0" ? "selected" : ""}>4.0</option>
                <option value="4.5" ${data.rateValue === "4.5" ? "selected" : ""}>4.5</option>
                <option value="5.0" ${data.rateValue === "5.0" ? "selected" : ""}>5.0</option>
            </select>
            <button type="button" id="rate-search-button">Rate Movie</button>
        `;

        if (data.rateMovieCandidates.length > 0) {
            let rows = "";

            for (const [index, movie] of data.rateMovieCandidates.entries()) {
                rows += `
                    <tr>
                        <td>${movie.title}</td>
                        <td>${movie.genres.replaceAll("|", ", ")}</td>
                        <td><button type="button" class="choose-rate-movie-button" data-index="${index}">Choose</button></td>
                    </tr>
                `;
            }

            html += `
                <p>Choose the correct movie:</p>
                <table>
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Genres</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
        }

        return html;
    };

    const renderSessionRatings = () => {
        const data = state.getData();

        if (data.sessionRatings.length === 0) {
            return "<p>You have not rated any movies in this session yet.</p>";
        }

        let rows = "";

        for (const item of data.sessionRatings) {
            rows += `
                <tr>
                    <td>${item.title}</td>
                    <td>${item.rating}</td>
                </tr>
            `;
        }

        return `
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>My Rating</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    };

    const renderRecommendations = () => {
        const data = state.getData();

        if (data.recommendations.length === 0) {
            return "<p>No recommendations to display.</p>";
        }

        let rows = "";

        for (const movie of data.recommendations) {
            rows += `
                <tr>
                    <td>${movie.title}</td>
                    <td>${movie.genres.replaceAll("|", ", ")}</td>
                    <td>${movie.predictedRating}</td>
                </tr>
            `;
        }

        return `
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Genres</th>
                        <th>Predicted Rating</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    };
    // ----------
    // I only changed part of the following code
    const renderNavigation = () => {
        const data = state.getData();

        return `
            <section class="section-navigation">
                <h2>Choose Functionality</h2>
                <button type="button" class="nav-button" data-section="addMovie">${data.currentSection === "addMovie" ? "-> " : ""}Add Movie</button>
                <button type="button" class="nav-button" data-section="search">${data.currentSection === "search" ? "-> " : ""}Search Movies</button>
                <!-- ---------- -->
                <button type="button" class="nav-button" data-section="tagSearch">${data.currentSection === "tagSearch" ? "-> " : ""}Search by Tag</button>
                <!-- ---------- -->
                <button type="button" class="nav-button" data-section="average">${data.currentSection === "average" ? "-> " : ""}Average Rating</button>
                <button type="button" class="nav-button" data-section="rate">${data.currentSection === "rate" ? "-> " : ""}Rate Movie</button>
                <button type="button" class="nav-button" data-section="recommendations">${data.currentSection === "recommendations" ? "-> " : ""}Recommendations</button>
            </section>
        `;
    };
    // ----------

    const renderCurrentSection = () => {
        const data = state.getData();

        if (data.currentSection === "addMovie") {
            return `
                <section class="section-add-movie">
                    <h2>Add a New Movie</h2>
                    <p>Fill in the movie information and submit it to the backend.</p>
                    <label for="new-movie-title">Title</label>
                    <input type="text" id="new-movie-title" value="${data.addMovieTitle}" placeholder="Movie title">
                    <label for="new-movie-genre-0">Genres</label>
                    ${renderAddMovieGenreInputs()}
                    <button type="button" id="add-genre-button">Add Genre</button>
                    <button type="button" id="add-movie-button">Add Movie</button>
                    ${renderMessage("addMovie")}
                </section>
            `;
        }

        if (data.currentSection === "search") {
            return `
                <section class="section-search">
                    <h2>Search Movies</h2>
                    <p>Search for movies by keyword.</p>
                    <label for="search-input">Keyword</label>
                    <input type="text" id="search-input" value="${data.searchKeyword}" placeholder="Search by title">
                    <button type="button" id="search-button">Search</button>
                    ${renderMessage("search")}
                    ${renderSearchResults()}
                </section>
            `;
        }

        // ----------
        if (data.currentSection === "tagSearch") {
            return `
                <section class="section-search">
                    <h2>Search Movies by Tag</h2>
                    <p>Search for movies using a tag keyword.</p>
                    <p>
                        Short keywords must match a tag exactly. Longer ones only need the same first 5 letters.
                        Matching is case-insensitive.
                    </p>
                    <label for="tag-search-input">Keyword</label>
                    <input type="text" id="tag-search-input" value="${data.tagSearchKeyword}" placeholder="Search by tag">
                    <button type="button" id="tag-search-button">Search by Tag</button>
                    ${renderMessage("tagSearch")}
                    ${renderTagSearchResults()}
                </section>
            `;
        }
        // ----------

        if (data.currentSection === "average") {
            return `
                <section class="section-average">
                    <h2>Display Average Rating</h2>
                    <p>Choose a searched movie and request its average rating.</p>
                    ${renderMessage("average")}
                    ${renderAverageRating()}
                </section>
            `;
        }

        if (data.currentSection === "rate") {
            return `
                <section class="section-rate">
                    <h2>Rate a Movie</h2>
                    <p>Choose a searched movie and store your rating only in this browser session.</p>
                    ${renderMessage("rate")}
                    ${renderRateMovie()}
                </section>
            `;
        }

        return `
            <section class="section-recommendations">
                <h2>Recommendations</h2>
                <p>Request personalized movie recommendations based on your session ratings.</p>
                <button type="button" id="recommendations-button">Get Recommendations</button>
                ${renderMessage("recommendations")}
                ${renderRecommendations()}
            </section>
        `;
    };

    const render = () => {
        const html = `
            <h1>MovieLens Web App</h1>
            ${renderNavigation()}
            <div style="display: flex; gap: 24px; align-items: flex-start;">
                <div style="flex: 2;">
                    ${renderCurrentSection()}
                </div>
                <div style="flex: 1;">
                    <section class="section-session">
                        <h2>My Session Ratings</h2>
                        <p>These ratings stay only in browser memory during the current session.</p>
                        ${renderSessionRatings()}
                    </section>
                </div>
            </div>
        `;

        const app = document.getElementById("app");
        app.innerHTML = html; // Rendering actually takes place here

        const navButtons = document.getElementsByClassName("nav-button");
        for (const button of navButtons) {
            button.addEventListener("click", (event) => {
                const data = state.getData();
                data.currentSection = event.target.dataset.section;     // event.target is the actual HTML element that was clicked
                state.setData(data);
            });
        }

        const addGenreButton = document.getElementById("add-genre-button");
        if (addGenreButton) {
            addGenreButton.addEventListener("click", () => {
                const data = readAddMovieFormValues();
                data.addMovieGenres.push("");
                state.setData(data);
            });
        }

        const addMovieButton = document.getElementById("add-movie-button");
        if (addMovieButton) {
            addMovieButton.addEventListener("click", async () => {
            const data = readAddMovieFormValues();
            state.setData(data);

            const title = data.addMovieTitle.trim();
            const genresList = data.addMovieGenres
                .map((genre) => genre.trim())
                .filter((genre) => genre !== "");
            const genres = genresList.join("|");

            if (!title || !genres) {
                setMessage("Please fill in both the title and the genres.", "error", "addMovie");
                return;
            }

            await addMovie(title, genres);
            });
        }

        const searchButton = document.getElementById("search-button");
        if (searchButton) {             // If searchButton isn't visible we don't want to continue
            searchButton.addEventListener("click", async () => {
            const searchInput = document.getElementById("search-input");
            const keyword = searchInput.value.trim();
            const data = state.getData();
            data.searchKeyword = keyword;
            state.setData(data);

            if (!keyword) {
                setMessage("Please enter a movie keyword before searching.", "error", "search");
                return;
            }

            await searchMovies(keyword);
            });
        }

        const searchInput = document.getElementById("search-input");
        if (searchInput) {
            searchInput.addEventListener("keydown", async (event) => {
                if (event.key === "Enter") {
                    searchButton.click();
                }
            });
        }

        // ----------
        const tagSearchButton = document.getElementById("tag-search-button");
        if (tagSearchButton) {
            tagSearchButton.addEventListener("click", async () => {
                const tagSearchInput = document.getElementById("tag-search-input");
                const keyword = tagSearchInput.value.trim();
                const data = state.getData();
                data.tagSearchKeyword = keyword;
                state.setData(data);

                if (!keyword) {
                    setMessage("Please enter a tag keyword before searching.", "error", "tagSearch");
                    return;
                }

                await searchMoviesByTag(keyword);
            });
        }

        const tagSearchInput = document.getElementById("tag-search-input");
        if (tagSearchInput) {
            tagSearchInput.addEventListener("keydown", async (event) => {
                if (event.key === "Enter") {
                    tagSearchButton.click();
                }
            });
        }
        // ----------

        const averageSearchButton = document.getElementById("average-search-button");
        if (averageSearchButton) {
            averageSearchButton.addEventListener("click", async () => {
            const averageSearchInput = document.getElementById("average-search-input");
            const keyword = averageSearchInput.value.trim();
            const data = state.getData();
            data.averageKeyword = keyword;
            state.setData(data);

            if (!keyword) {
                setMessage("Please enter a movie title before asking for an average rating.", "error", "average");
                return;
            }

            await handleAverageMovieSearch(keyword);
            });
        }

        const averageSearchInput = document.getElementById("average-search-input");
        if (averageSearchInput) {
            averageSearchInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    averageSearchButton.click();
                }
            });
        }

        const chooseAverageMovieButtons = document.getElementsByClassName("choose-average-movie-button");
        for (const button of chooseAverageMovieButtons) {
            button.addEventListener("click", async (event) => {
                const data = state.getData();
                const index = parseInt(event.target.dataset.index, 10);
                const movie = data.averageMovieCandidates[index];
                await fetchAverageRating(movie);
            });
        }

        const rateSearchButton = document.getElementById("rate-search-button");
        if (rateSearchButton) {
            rateSearchButton.addEventListener("click", async () => {
            const rateSearchInput = document.getElementById("rate-search-input");
            const rateValueSelect = document.getElementById("rate-value-select");
            const keyword = rateSearchInput.value.trim();
            const rating = rateValueSelect.value;
            const data = state.getData();
            data.rateKeyword = keyword;
            data.rateValue = rating;
            state.setData(data);

            if (!keyword) {
                setMessage("Please enter a movie title before rating a movie.", "error", "rate");
                return;
            }

            if (!rating) {
                setMessage("Please choose a rating before saving it.", "error", "rate");
                return;
            }

            await handleRateMovieSearch(keyword, rating);
            });
        }

        const rateSearchInput = document.getElementById("rate-search-input");
        if (rateSearchInput) {
            rateSearchInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    rateSearchButton.click();
                }
            });
        }

        const chooseRateMovieButtons = document.getElementsByClassName("choose-rate-movie-button");
        for (const button of chooseRateMovieButtons) {
            button.addEventListener("click", (event) => {
                const data = state.getData();
                const index = parseInt(event.target.dataset.index, 10);
                const movie = data.rateMovieCandidates[index];
                saveSessionRating(movie, parseFloat(data.rateValue));
            });
        }

        const recommendationsButton = document.getElementById("recommendations-button");
        if (recommendationsButton) {
            recommendationsButton.addEventListener("click", async () => {
                await getRecommendations();
            });
        }

        const showAllResultsButton = document.getElementById("show-all-results-button");
        if (showAllResultsButton) {
            showAllResultsButton.addEventListener("click", () => {
                const data = state.getData();
                data.showAllSearchResults = true;
                state.setData(data);
            });
        }
    };

    state = new State(render);
    render();
});
