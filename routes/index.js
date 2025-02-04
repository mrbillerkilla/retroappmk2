const express = require('express');
const router = express.Router();
const db = require('../app'); // MySQL-verbinding importeren
const async = require('async');






// Loginpagina
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Loginverwerking
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Controleer eerst de 'students'-tabel
    const studentQuery = 'SELECT students.*, classes.name AS class_name FROM students LEFT JOIN classes ON students.class_id = classes.id WHERE students.username = ? AND students.password = ?';
    db.query(studentQuery, [username, password], (err, studentResults) => {
        if (err) {
            console.error(err);
            return res.render('login', { error: 'Er is een fout opgetreden.' });
        }

        if (studentResults.length > 0) {
            // Student gevonden
            req.session.user = {
                id: studentResults[0].id,
                username: studentResults[0].username,
                role: 'student',
                class: studentResults[0].class_name,
            };
            return res.redirect('/dashboard');
        }

        // Controleer de 'teachers'-tabel
        const teacherQuery = 'SELECT * FROM teachers WHERE username = ? AND password = ?';
        db.query(teacherQuery, [username, password], (err, teacherResults) => {
            if (err) {
                console.error(err);
                return res.render('login', { error: 'Er is een fout opgetreden.' });
            }

            if (teacherResults.length > 0) {
                // Teacher gevonden
                req.session.user = {
                    id: teacherResults[0].id,
                    username: teacherResults[0].username,
                    role: 'teacher',
                    class: 'Geen specifieke klas (docent)',
                };
                return res.redirect('/dashboard');
            }

            // Geen gebruiker gevonden
            res.render('login', { error: 'Ongeldige gebruikersnaam of wachtwoord.' });
        });
    });
});


router.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Alleen ingelogde gebruikers kunnen het dashboard zien
    }

    const user = req.session.user;
    const userClassName = user.class; // De klas van de ingelogde gebruiker

    // Haal alle klassen op voor de docent en de retrospectieven van de klas van de student
    const queryClasses = 'SELECT * FROM classes';
    let queryRetrospectives;

    if (user.role === 'teacher') {
        // Als de gebruiker een docent is, geef alle retrospectieven
        queryRetrospectives = 'SELECT * FROM retrospectives';
    } else {
        // Als de gebruiker een student is, geef de retrospectieven van de klas van de student
        queryRetrospectives = 'SELECT * FROM retrospectives WHERE class_id = (SELECT id FROM classes WHERE name = ?)';
    }

    db.query(queryClasses, (err, classes) => {
        if (err) {
            console.error(err);
            return res.render('dashboard', { user: user, classes: [] });
        }

        // Haal de retrospectieven voor de docent of de klas van de student
        db.query(queryRetrospectives, [userClassName], (err, retrospectives) => {
            if (err) {
                console.error(err);
                return res.render('dashboard', { user: user, classes: classes, retrospectives: [] });
            }

            // Haal de vragen op voor elk retrospectief en de antwoorden van de student (indien van toepassing)
            const retrospectivesWithQuestions = [];

            async.each(retrospectives, (retrospective, callback) => {
                const queryQuestions = 'SELECT * FROM questions WHERE retrospective_id = ?';
                
                db.query(queryQuestions, [retrospective.id], (err, questions) => {
                    if (err) {
                        console.error(err);
                    }

                    retrospective.questions = questions;

                    // Als de gebruiker een student is, haal dan de antwoorden van de student op
                    if (user.role === 'student') {
                        const queryStudentAnswers = `
                            SELECT sr.answer, q.text AS question_text 
                            FROM student_responses sr
                            JOIN questions q ON sr.question_id = q.id
                            WHERE sr.student_id = ? AND sr.retrospective_id = ?
                        `;
                        db.query(queryStudentAnswers, [user.id, retrospective.id], (err, studentAnswers) => {
                            if (err) {
                                console.error(err);
                            }

                            retrospective.student_answers = studentAnswers;
                            retrospectivesWithQuestions.push(retrospective);
                            callback();
                        });
                    } else if (user.role === 'teacher') {
                        // Voor de docent, haal alle antwoorden van de studenten op
                        const queryAllStudentAnswers = `
                            SELECT s.username AS student_name, sr.answer, q.text AS question_text, c.name AS class_name
                            FROM student_responses sr
                            JOIN students s ON sr.student_id = s.id
                            JOIN questions q ON sr.question_id = q.id
                            JOIN classes c ON s.class_id = c.id
                            WHERE sr.retrospective_id = ?
                        `;
                        db.query(queryAllStudentAnswers, [retrospective.id], (err, allStudentAnswers) => {
                            if (err) {
                                console.error(err);
                            }

                            retrospective.all_student_answers = allStudentAnswers;
                            retrospectivesWithQuestions.push(retrospective);
                            callback();
                        });
                    }
                });
            }, (err) => {
                if (err) {
                    console.error(err);
                    return res.render('dashboard', { user: user, classes: classes, retrospectives: retrospectivesWithQuestions });
                }

                // Render de dashboardpagina voor de student of docent
                res.render('dashboard', {
                    user: user,
                    classes: classes,
                    retrospectives: retrospectivesWithQuestions,
                    showAddRetrospective: user.role === 'teacher', // Laat de optie om een retrospectief toe te voegen zien voor docenten
                });
            });
        });
    });
});






// Uitloggen
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Retrospective-pagina
router.get('/retrospective', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Gebruiker moet ingelogd zijn
    }

    res.render('retrospective', { user: req.session.user });
});

// Toon formulier voor docent om retrospectief toe te voegen
router.get('/add-retrospective', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Alleen ingelogde gebruikers kunnen het formulier zien
    }

    const user = req.session.user;

    // Haal alle klassen op (zodat de docent alle klassen kan zien)
    const query = 'SELECT * FROM classes';

    db.query(query, (err, classes) => {
        if (err) {
            console.error(err);
            return res.render('add-retrospective', { user: user, classes: [] });
        }

        // Toon de add-retrospective pagina met de lijst van klassen
        res.render('add-retrospective', { user: user, classes: classes });
    });
});

router.post('/retrospective/submit', (req, res) => {
    console.log('Request body:', req.body); // Debugging

    const retrospectiveId = req.body.retrospective_id;
    const studentId = req.session.user?.id; // Zorg ervoor dat de student is ingelogd

    if (!retrospectiveId || !studentId) {
        console.error('Retrospective ID of student ID ontbreekt!');
        return res.status(400).send('Retrospective ID of student ID ontbreekt.');
    }

    // Verwerk de antwoorden uit het formulier
    const answers = Object.keys(req.body)
        .filter(key => key.startsWith('answer_'))
        .map(key => {
            const questionId = key.split('_')[1]; // Haalt de ID van de vraag
            return {
                student_id: studentId,
                retrospective_id: retrospectiveId,
                question_id: questionId,
                answer: req.body[key],
            };
        });

    console.log('Answers to save:', answers);

    if (answers.length === 0) {
        console.error('Geen antwoorden gevonden!');
        return res.status(400).send('Geen antwoorden om op te slaan.');
    }

    // SQL-query om de antwoorden op te slaan
    const query = `
        INSERT INTO student_responses (student_id, retrospective_id, question_id, answer)
        VALUES ?
    `;

    // Bouw de waarden voor de batch-insert
    const values = answers.map(a => [
        a.student_id,
        a.retrospective_id,
        a.question_id,
        a.answer,
    ]);

    // Voer de query uit
    db.query(query, [values], (err, result) => {
        if (err) {
            console.error('Error tijdens het opslaan van antwoorden:', err);
            return res.status(500).send('Fout bij het opslaan van de antwoorden.');
        }

        console.log('Antwoorden succesvol opgeslagen:', result);
        res.redirect('/dashboard'); // Terug naar het dashboard
    });
});

router.delete('/retrospective/:id', (req, res) => {
    const retrospectiveId = req.params.id;

    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.status(403).send('Toegang geweigerd.');
    }

    const deleteRetrospectiveQuery = 'DELETE FROM retrospectives WHERE id = ?';
    const deleteQuestionsQuery = 'DELETE FROM questions WHERE retrospective_id = ?';
    const deleteAnswersQuery = 'DELETE FROM student_responses WHERE retrospective_id = ?';

    // Verwijder retrospectief en gekoppelde data
    db.query(deleteRetrospectiveQuery, [retrospectiveId], (err) => {
        if (err) {
            console.error('Fout bij verwijderen retrospectief:', err);
            return res.status(500).send('Fout bij verwijderen retrospectief.');
        }

        db.query(deleteQuestionsQuery, [retrospectiveId], (err) => {
            if (err) {
                console.error('Fout bij verwijderen vragen:', err);
                return res.status(500).send('Fout bij verwijderen vragen.');
            }

            db.query(deleteAnswersQuery, [retrospectiveId], (err) => {
                if (err) {
                    console.error('Fout bij verwijderen antwoorden:', err);
                    return res.status(500).send('Fout bij verwijderen antwoorden.');
                }

                console.log(`Retrospectief met ID ${retrospectiveId} verwijderd.`);
                res.redirect('/dashboard'); // Pas aan naar je gewenste route
            });
        });
    });
});



// Verwerk het retrospectief formulier
router.post('/add-retrospective', (req, res) => {
    const { class_id, question_1, question_2, question_3 } = req.body;

    // Voeg het retrospectief toe aan de database
    const query = 'INSERT INTO retrospectives (class_id, teacher_id, question_1, question_2, question_3) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [class_id, req.session.user.id, question_1, question_2, question_3], (err, result) => {
        if (err) {
            console.error(err);
            return res.render('add-retrospective', { error: 'Er is een fout opgetreden bij het toevoegen van het retrospectief.' });
        }

        res.redirect('/dashboard'); // Redirect naar het dashboard van de docent
    });
});

// Verwerk het retrospectief formulier (voor docenten)
router.post('/submit-retrospective', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.redirect('/login'); // Alleen docenten mogen retrospectieven indienen
    }

    const { name, class_id, questions } = req.body;

    // Voeg het retrospectief toe aan de database
    const queryRetrospective = 'INSERT INTO retrospectives (name, class_id) VALUES (?, ?)';
    db.query(queryRetrospective, [name, class_id], (err, result) => {
        if (err) {
            console.error(err);
            return res.redirect('/add-retrospective'); // Als er een fout optreedt, probeer opnieuw
        }

        const retrospectiveId = result.insertId;

        // Voeg de vragen toe aan de database
        const queryQuestions = 'INSERT INTO questions (text, retrospective_id) VALUES ?';
        const questionsValues = questions.map(question => [question, retrospectiveId]);

        db.query(queryQuestions, [questionsValues], (err) => {
            if (err) {
                console.error(err);
                return res.redirect('/add-retrospective');
            }

            // Redirect naar het dashboard na het toevoegen van het retrospectief
            res.redirect('/dashboard');
        });
    });
});





// Toon het retrospectief formulier voor de student
router.get('/retrospective/:id', (req, res) => {
    const retrospectiveId = req.params.id;
    const studentId = req.session.user.id;

    // Haal het retrospectief op voor de klas van de student
    const query = 'SELECT * FROM retrospectives WHERE id = ?';
    db.query(query, [retrospectiveId], (err, retrospective) => {
        if (err || retrospective.length === 0) {
            console.error('Fout bij het ophalen van retrospectief:', err);
            return res.redirect('/dashboard'); // Als er geen retrospectief is
        }

        // Haal de bijbehorende vragen op
        const questionsQuery = 'SELECT * FROM questions WHERE retrospective_id = ?';
        db.query(questionsQuery, [retrospectiveId], (err, questions) => {
            if (err) {
                console.error('Fout bij het ophalen van vragen:', err);
                return res.redirect('/dashboard'); // Bij een fout terug naar het dashboard
            }

            // Voeg de vragen toe aan het retrospectief object
            retrospective[0].questions = questions;

            // Render het formulier
            const checkAnswersQuery = 'SELECT * FROM student_responses WHERE student_id = ? AND retrospective_id = ?';
            db.query(checkAnswersQuery, [studentId, retrospectiveId], (err, responses) => {
                if (err) {
                    console.error('Fout bij het controleren van antwoorden:', err);
                    return res.redirect('/dashboard');
                }

                if (responses.length === 0) {
                    // Geen antwoorden gevonden, toon het formulier
                    return res.render('retrospective-form', {
                        retrospective: retrospective[0],
                        user: req.session.user,
                    });
                }

                // Antwoorden gevonden, toon het bewerkingsformulier
                res.render('retrospective-edit', {
                    retrospective: retrospective[0],
                    user: req.session.user,
                    responses: responses,
                });
            });
        });
    });
});



// Route om een retrospectief antwoord te bewerken
router.get('/retrospective/:id/edit', (req, res) => {
    const retrospectiveId = req.params.id;
    const user = req.session.user;

    if (!user || user.role !== 'student') {
        return res.redirect('/login'); // Alleen ingelogde studenten kunnen antwoorden bewerken
    }

    // Haal het retrospectief op, samen met de bijbehorende vragen en het antwoord van de student
    const queryRetrospective = 'SELECT * FROM retrospectives WHERE id = ?';
    const queryQuestions = 'SELECT * FROM questions WHERE retrospective_id = ?';
    const queryStudentAnswers = `
        SELECT question_id, answer FROM student_responses
        WHERE student_id = ? AND retrospective_id = ?
    `;

    db.query(queryRetrospective, [retrospectiveId], (err, [retrospective]) => {
        if (err || !retrospective) {
            console.error(err);
            return res.redirect('/dashboard');
        }

        db.query(queryQuestions, [retrospectiveId], (err, questions) => {
            if (err) {
                console.error(err);
                return res.redirect('/dashboard');
            }

            db.query(queryStudentAnswers, [user.id, retrospectiveId], (err, studentAnswers) => {
                if (err) {
                    console.error(err);
                    return res.redirect('/dashboard');
                }

                // Maak een object om de antwoorden op te slaan
                const answers = {};
                studentAnswers.forEach(answer => {
                    answers[answer.question_id] = answer.answer;
                });

                res.render('retrospective-edit', {
                    retrospective: retrospective,
                    questions: questions,
                    answers: answers,
                    user: user
                });
            });
        });
    });
});
// Route om de antwoorden van een student bij te werken
router.post('/retrospective/:id/update', (req, res) => {
    const retrospectiveId = req.params.id;
    const user = req.session.user;

    if (!user || user.role !== 'student') {
        return res.redirect('/login'); // Alleen ingelogde studenten kunnen antwoorden bewerken
    }

    // Haal de antwoorden uit de request body
    const updatedAnswers = [];
    Object.keys(req.body).forEach(key => {
        if (key.startsWith('answer_')) {
            const questionId = key.split('_')[1];
            const answer = req.body[key];
            updatedAnswers.push({ questionId, answer });
        }
    });

    // Werk de antwoorden bij in de database
    updatedAnswers.forEach(({ questionId, answer }) => {
        const queryUpdateAnswer = `
            UPDATE student_responses
            SET answer = ?
            WHERE student_id = ? AND retrospective_id = ? AND question_id = ?
        `;
        db.query(queryUpdateAnswer, [answer, user.id, retrospectiveId, questionId], (err) => {
            if (err) {
                console.error(err);
            }
        });
    });

    // Redirect terug naar het dashboard of retrospectief
    res.redirect('/dashboard');
});



// Verwerk de antwoorden van de student (voor het invullen van het retrospectief)
// Verwerk de antwoorden van de student
router.post('/submit-retrospective', (req, res) => {
    const { retrospective_id } = req.body;
    const studentId = req.session.user.id;

    // Maak een array om de antwoorden in op te slaan
    const answers = Object.keys(req.body)
    .filter(key => key.startsWith('answer_'))
    .map(key => {
        const questionId = key.split('_')[1]; // Haalt de ID van de vraag
        return {
            student_id: req.session.user.id,
            retrospective_id: req.body.retrospective_id,
            question_id: questionId,
            answer: req.body[key],
        };
    });

console.log('Answers to save:', answers);


    // Loop door de body van het verzoek en verzamel de antwoorden
    Object.keys(req.body).forEach((key) => {
        if (key.startsWith('answer_')) { // Alleen de velden die met 'answer_' beginnen
            const questionId = key.split('_')[1]; // Haal de question_id uit de key
            const answer = req.body[key]; // Verkrijg het antwoord

            // Voeg dit antwoord toe aan de array
            answers.push({ questionId, answer });
        }
    });

    // Check of we antwoorden hebben gevonden
    if (answers.length === 0) {
        return res.redirect('/dashboard'); // Geen antwoorden om op te slaan
    }

    // Voeg de antwoorden toe aan de database
    async.each(answers, (answer, callback) => {
        const query = `
            INSERT INTO student_responses (student_id, retrospective_id, question_id, answer)
            VALUES (?, ?, ?, ?)
        `;

        // Hier voeren we de INSERT uit voor elke vraag die beantwoord is
        db.query(query, [studentId, retrospective_id, answer.questionId, answer.answer], (err) => {
            if (err) {
                console.error('Fout bij het opslaan van antwoord:', err);
                return callback(err); // Stop met verder gaan bij een fout
            }
            callback(); // Ga door met de volgende vraag
        });
    }, (err) => {
        if (err) {
            return res.redirect('/dashboard'); // Redirect bij een fout
        }

        // Succes: stuur de gebruiker terug naar het dashboard
        res.redirect('/dashboard');
    });
});







module.exports = router;
