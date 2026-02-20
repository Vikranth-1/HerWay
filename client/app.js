
document.addEventListener('DOMContentLoaded', () => {
    // --- Navigation Scroll Effect ---
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.header');
        if (header) {
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        }
    });

    // --- Home Page Search Logic ---
    const careerSearchBtn = document.getElementById('career-search-btn');
    const careerSearchInput = document.getElementById('career-search-input');
    if (careerSearchBtn && careerSearchInput) {
        careerSearchBtn.addEventListener('click', () => {
            const career = careerSearchInput.value.trim();
            if (career) {
                localStorage.setItem('targetCareer', career);
                window.location.href = 'skill-gap-finder.html';
            }
        });
        careerSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') careerSearchBtn.click();
        });
    }

    // --- Action Card Triggers ---
    const skillGapTriggers = document.querySelectorAll('.skill-gap-trigger');
    skillGapTriggers.forEach(btn => {
        btn.addEventListener('click', () => {
            localStorage.removeItem('targetCareer');
            window.location.href = 'skill-gap-finder.html';
        });
    });

    const barterTriggers = document.querySelectorAll('.barter-btn-trigger');
    barterTriggers.forEach(btn => {
        btn.addEventListener('click', () => window.location.href = 'barter.html');
    });

    // --- Google Translate Initialization ---
    window.googleTranslateElementInit = function () {
        new google.translate.TranslateElement({
            pageLanguage: 'en',
            includedLanguages: 'en,hi,ta,te,kn,mr',
            layout: google.translate.TranslateElement.InlineLayout.SIMPLE
        }, 'google_translate_element');
    };

    const gtScript = document.createElement('script');
    gtScript.type = 'text/javascript';
    gtScript.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    document.body.appendChild(gtScript);

    // --- reveal logic ---
    function initReveal() {
        const reveals = document.querySelectorAll('.reveal, .scroll-reveal');
        reveals.forEach(el => el.classList.add('active'));
        reveals.forEach(el => el.classList.add('visible'));
    }
    initReveal();

    // --- Interview Logic ---
    const API_BASE = 'http://localhost:5000/api';
    const TOTAL_QUESTIONS = 10;

    let currentQ = 0;
    let questionsAsked = [];
    let interviewResults = [];
    let mediaRecorder = null;
    let audioChunks = [];
    let lastAudioBlob = null;
    let userSkills = '';

    // Detect Page Type - Simplified (Confidence Check removed)
    const DEFAULT_MODEL = 'llama';

    // Load user skills from localStorage
    try {
        const loggedInUser = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
        userSkills = Array.isArray(loggedInUser.skills) ? loggedInUser.skills.join(', ') : (loggedInUser.skills || '');

        // Update Header with User Name
        const userNameEl = document.getElementById('user-name-display');
        if (userNameEl && loggedInUser.name) userNameEl.textContent = loggedInUser.name;
    } catch (e) { console.error('Error loading user skills', e); }

    const screens = {
        start: document.getElementById('interview-start-screen') || document.getElementById('screen-start'),
        interview: document.getElementById('interview-container') || document.getElementById('screen-interview'),
        results: document.getElementById('results-screen') || document.getElementById('screen-results')
    };

    const startBtn = document.getElementById('start-interview-btn') || document.getElementById('start-confidence-btn');
    const aiQuestionText = document.getElementById('ai-question-text') || document.getElementById('question-text');
    const qNumDisplay = document.getElementById('current-q-num') || document.getElementById('q-num');
    const progressFill = document.getElementById('interview-progress-fill') || document.getElementById('progress-fill');
    const micBtn = document.getElementById('mic-btn');
    const micPulse = document.getElementById('mic-pulse') || document.getElementById('mic-ripple');
    const micStatus = document.getElementById('mic-status') || document.getElementById('mic-hint');
    const postRecordActions = document.getElementById('post-record-actions') || document.getElementById('post-actions');
    const restartRecordBtn = document.getElementById('restart-record-btn') || document.getElementById('restart-btn');
    const submitAnswerBtn = document.getElementById('submit-answer-btn') || document.getElementById('submit-btn');
    const detailedResultsList = document.getElementById('detailed-results-list') || document.getElementById('result-cards');
    const finalTotalScore = document.getElementById('final-total-score') || document.getElementById('total-score');
    const overallFeedbackEl = document.getElementById('overall-feedback');
    const questionLoader = document.getElementById('question-loader');

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            showScreen('interview');
            loadNextQuestion();
        });
    }

    function showScreen(name) {
        Object.keys(screens).forEach(key => {
            if (screens[key]) {
                screens[key].classList.add('hidden');
                screens[key].classList.remove('active');
            }
        });
        if (screens[name]) {
            screens[name].classList.remove('hidden');
            screens[name].classList.add('active');
        }
    }

    async function loadNextQuestion() {
        if (currentQ >= TOTAL_QUESTIONS) {
            showResults();
            return;
        }

        if (qNumDisplay) qNumDisplay.textContent = currentQ + 1;
        if (progressFill) progressFill.style.width = `${((currentQ + 1) / TOTAL_QUESTIONS) * 100}%`;

        if (aiQuestionText) {
            aiQuestionText.textContent = "";
            aiQuestionText.classList.add('hidden');
        }
        if (questionLoader) questionLoader.classList.remove('hidden');

        if (micBtn) micBtn.disabled = true;
        if (postRecordActions) postRecordActions.classList.add('hidden');
        if (micStatus) micStatus.classList.remove('hidden');

        try {
            const targetCareer = localStorage.getItem('targetCareer') || '';
            const res = await fetch(`${API_BASE}/ai/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skills: userSkills,
                    career: targetCareer,
                    history: questionsAsked,
                    modelType: DEFAULT_MODEL
                })
            });
            const data = await res.json();
            const question = data.question || "Tell me about one of your skills.";

            if (questionLoader) questionLoader.classList.add('hidden');
            if (aiQuestionText) {
                aiQuestionText.textContent = question;
                aiQuestionText.classList.remove('hidden');
            }
            questionsAsked.push(question);
            if (micBtn) micBtn.disabled = false;
        } catch (err) {
            console.error('Error fetching question', err);
            if (questionLoader) questionLoader.classList.add('hidden');
            if (aiQuestionText) {
                aiQuestionText.textContent = "How do you handle difficult situations?";
                aiQuestionText.classList.remove('hidden');
            }
            if (micBtn) micBtn.disabled = false;
        }
    }

    // --- Voice Recording Logic (Press and Hold) ---
    if (micBtn) {
        micBtn.addEventListener('mousedown', startRecording);
        micBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startRecording();
        });

        window.addEventListener('mouseup', stopRecording);
        window.addEventListener('touchend', stopRecording);
    }

    async function startRecording() {
        if (micBtn.disabled) return;

        audioChunks = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                lastAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                stream.getTracks().forEach(track => track.stop());
                showPostActions();
            };
            mediaRecorder.start();
            if (micPulse) micPulse.classList.remove('hidden');
            if (micStatus) micStatus.textContent = "Recording... Release to stop";

            const recordingIndicator = document.getElementById('recording-indicator');
            if (recordingIndicator) recordingIndicator.classList.remove('hidden');
        } catch (err) {
            console.error('Mic access denied', err);
            alert('Please allow microphone access to participate.');
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            if (micPulse) micPulse.classList.add('hidden');
            if (micStatus) micStatus.textContent = "Done! Review your answer.";

            const recordingIndicator = document.getElementById('recording-indicator');
            if (recordingIndicator) recordingIndicator.classList.add('hidden');
        }
    }

    function showPostActions() {
        if (micStatus) micStatus.classList.add('hidden');
        if (postRecordActions) postRecordActions.classList.remove('hidden');

        // Show transcript preview if available
        const transcriptEl = document.getElementById('transcript-preview');
        if (transcriptEl) transcriptEl.classList.add('hidden');
    }

    if (restartRecordBtn) {
        restartRecordBtn.addEventListener('click', () => {
            postRecordActions.classList.add('hidden');
            micStatus.classList.remove('hidden');
            micStatus.textContent = translations[currentLang]?.press_to_record || "Press and Hold to Record";
            lastAudioBlob = null;
        });
    }

    if (submitAnswerBtn) {
        submitAnswerBtn.addEventListener('click', async () => {
            if (!lastAudioBlob) return;

            submitAnswerBtn.disabled = true;
            const originalText = submitAnswerBtn.textContent;
            submitAnswerBtn.textContent = translations[currentLang]?.processing || "Processing...";

            const processingMsg = document.getElementById('processing-msg');
            if (processingMsg) processingMsg.classList.remove('hidden');

            try {
                // 1. Transcribe
                const formData = new FormData();
                formData.append('audio', lastAudioBlob, 'answer.webm');
                const transcribeRes = await fetch(`${API_BASE}/ai/transcribe`, {
                    method: 'POST',
                    body: formData
                });
                const transcribeData = await transcribeRes.json();
                const transcription = transcribeData.text || "";

                // 2. Assess
                const assessRes = await fetch(`${API_BASE}/ai/assess`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question: questionsAsked[currentQ],
                        answer: transcription,
                        modelType: DEFAULT_MODEL
                    })
                });
                const assessData = await assessRes.json();

                interviewResults.push({
                    question: questionsAsked[currentQ],
                    answer: transcription,
                    score: assessData.score || 0,
                    feedback: assessData.feedback || "Good effort."
                });

                currentQ++;
                submitAnswerBtn.disabled = false;
                submitAnswerBtn.textContent = originalText;
                if (processingMsg) processingMsg.classList.add('hidden');
                loadNextQuestion();
            } catch (err) {
                console.error('Error submitting answer', err);
                alert('Connection error. Please try again.');
                submitAnswerBtn.disabled = false;
                submitAnswerBtn.textContent = "Retry Submit";
                if (processingMsg) processingMsg.classList.add('hidden');
            }
        });
    }

    function showResults() {
        showScreen('results');
        let totalScoreSum = 0;
        if (detailedResultsList) detailedResultsList.innerHTML = '';

        interviewResults.forEach((res, index) => {
            totalScoreSum += (res.score * 10);

            const card = document.createElement('div');
            card.className = 'glass-card result-card';
            card.style.padding = '1.5rem';
            card.innerHTML = `
                <div style="display: flex; gap: 1rem; align-items: flex-start;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--grad-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0;">
                        ${index + 1}
                    </div>
                    <div>
                        <h4 style="margin-bottom: 0.5rem; color: var(--secondary);">${res.question}</h4>
                        <p style="font-size: 0.9rem; color: var(--text-muted); font-style: italic; margin-bottom: 0.8rem;">
                            " ${res.answer || 'No spoken response detected.'} "
                        </p>
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 0.5rem;">
                             <div style="flex-grow: 1; height: 8px; background: rgba(0,0,0,0.05); border-radius: 10px; overflow: hidden;">
                                <div style="width: ${res.score * 10}%; height: 100%; background: var(--grad-primary); border-radius: 10px;"></div>
                             </div>
                             <span style="font-weight: 700; color: var(--secondary);">${res.score}/10</span>
                        </div>
                        <p style="font-size: 0.85rem; color: var(--primary); font-weight: 600;">${res.feedback}</p>
                    </div>
                </div>
            `;
            if (detailedResultsList) detailedResultsList.appendChild(card);
        });

        const finalScore = Math.round(totalScoreSum / TOTAL_QUESTIONS);
        if (finalTotalScore) finalTotalScore.textContent = finalScore;

        // Confidence Badge
        const scoreBadge = document.getElementById('score-badge');
        if (scoreBadge) {
            if (finalScore >= 80) { scoreBadge.textContent = "INTERVIEW READY"; scoreBadge.style.background = "#dcfce7"; scoreBadge.style.color = "#166534"; }
            else if (finalScore >= 60) { scoreBadge.textContent = "GOOD CONFIDENCE"; scoreBadge.style.background = "#fef9c3"; scoreBadge.style.color = "#854d0e"; }
            else { scoreBadge.textContent = "GROWING"; scoreBadge.style.background = "#fee2e2"; scoreBadge.style.color = "#991b1b"; }
        }

        if (overallFeedbackEl) {
            if (finalScore >= 80) overallFeedbackEl.textContent = "Outstanding! You are highly confident and ready for any professional challenge.";
            else if (finalScore >= 60) overallFeedbackEl.textContent = "Great job! Your confidence is strong, but a bit more practice on specific skills will make you unstoppable.";
            else overallFeedbackEl.textContent = "Good start. Keep practicing your responses and focus on sharing clear examples of your experiences.";
        }

        // Save Results & Generate Roadmap
        const user = JSON.parse(localStorage.getItem('loggedInUser'));
        if (user) {
            saveResults(user.id, finalScore);
        }
    }

    async function saveResults(userId, finalScore) {
        const careerIntent = localStorage.getItem('targetCareer') || '';
        try {
            // 1. Save Session
            await fetch(`${API_BASE}/skill-gap/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    careerIntent,
                    sessionData: interviewResults,
                    totalScore: finalScore
                })
            });

            // 2. Generate Roadmap
            const roadmapRes = await fetch(`${API_BASE}/roadmap/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    careerIntent,
                    results: interviewResults
                })
            });
            const roadmapData = await roadmapRes.json();
            if (roadmapData.success) {
                displayRoadmap(roadmapData.roadmap);
            }
        } catch (err) {
            console.error('Persistence failed', err);
        }
    }

    function displayRoadmap(roadmap) {
        const roadmapSection = document.getElementById('roadmap-section');
        const roadmapContainer = document.getElementById('roadmap-container');
        if (!roadmapSection || !roadmapContainer || !roadmap.length) return;

        roadmapSection.classList.remove('hidden');
        roadmapContainer.innerHTML = '';

        roadmap.forEach((entry, index) => {
            const step = document.createElement('div');
            step.className = 'glass-card';
            step.style.padding = '1.5rem';
            step.style.position = 'relative';
            step.style.borderLeft = '4px solid var(--primary)';

            step.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h4 style="color: var(--secondary); margin-bottom: 0.5rem;">${entry.course_name || entry.skill_name}</h4>
                        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">${entry.notes}</p>
                        ${entry.course_provider ? `
                            <div style="display: flex; gap: 1rem; font-size: 0.85rem; color: var(--primary); font-weight: 600;">
                                <span>Provider: ${entry.course_provider}</span>
                                ${entry.course_link ? `<a href="${entry.course_link}" target="_blank" style="color: var(--secondary);">Enroll Now →</a>` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            roadmapContainer.appendChild(step);
        });
    }

    // --- Authentication Logic ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            const btn = loginForm.querySelector('button');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = translations[currentLang]?.loading || "Logging in...";

            try {
                const res = await fetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();
                if (res.ok) {
                    localStorage.setItem('loggedInUser', JSON.stringify(data.user));
                    window.location.href = 'index.html';
                } else {
                    alert(data.error || 'Login failed');
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            } catch (err) {
                console.error('Login error', err);
                alert('Connection error');
                btn.disabled = false;
                btn.textContent = originalText;
            }
        });
    }

    // --- Home Page Navigation ---

    // Quick Action Navigations
    document.querySelectorAll('.skill-gap-trigger').forEach(el => {
        el.addEventListener('click', () => window.location.href = 'skill-gap-finder.html');
    });
    document.querySelectorAll('.barter-btn-trigger').forEach(el => {
        el.addEventListener('click', () => window.location.href = 'barter.html');
    });
    document.querySelectorAll('.profile-trigger').forEach(el => {
        el.addEventListener('click', () => window.location.href = 'profile.html');
    });

    // Logout handling
    document.querySelectorAll('[onclick*="Logout"], .logout-btn, #logout-btn').forEach(el => {
        el.removeAttribute('onclick');
        el.addEventListener('click', () => {
            localStorage.removeItem('loggedInUser');
            window.location.href = 'login.html';
        });
    });

    // --- Profile Page Initialization ---
    if (window.location.pathname.includes('profile.html')) {
        loadProfile();
    }

    async function loadProfile() {
        const urlParams = new URLSearchParams(window.location.search);
        const loggedInUser = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
        const profileId = urlParams.get('id') || loggedInUser.id;

        if (!profileId) {
            window.location.href = 'login.html';
            return;
        }

        const isOwnProfile = !urlParams.get('id') || urlParams.get('id') == loggedInUser.id;

        // Show/Hide Edit UI
        const addSkillBtn = document.getElementById('add-skill-btn');
        const editBioBtn = document.getElementById('edit-bio-btn');
        const photoOverlay = document.querySelector('.photo-overlay');
        const otherBanner = document.getElementById('other-profile-banner');

        if (isOwnProfile) {
            if (addSkillBtn) addSkillBtn.style.display = 'block';
            if (editBioBtn) editBioBtn.style.display = 'block';
            if (photoOverlay) photoOverlay.style.display = 'block';
        } else {
            if (otherBanner) otherBanner.style.display = 'block';
        }

        try {
            const res = await fetch(`${API_BASE}/user/${profileId}`);
            const user = await res.json();

            // Populate UI
            const nameEl = document.getElementById('profile-name');
            const bioEl = document.getElementById('profile-bio');
            const locEl = document.getElementById('profile-location');
            const imgEl = document.getElementById('profile-img');
            const goalEl = document.getElementById('career-goal-tag');

            if (nameEl) nameEl.textContent = user.name || 'Anonymous User';
            if (bioEl) bioEl.textContent = user.bio || 'Professional in growth';
            if (locEl) locEl.textContent = user.location || 'India';
            if (goalEl) {
                goalEl.textContent = user.career_goal || 'Exploring Career Paths';
                goalEl.style.display = user.career_goal ? 'inline-block' : 'none';
            }
            if (imgEl && user.profile_img) imgEl.src = user.profile_img;

            // Populate Skills
            renderSkills(user.skills || []);

            // Populate Barters
            renderBarters(user.barters || []);

        } catch (err) {
            console.error('Error loading profile', err);
        }
    }

    function renderSkills(skills) {
        const container = document.getElementById('profile-skills');
        if (!container) return;
        container.innerHTML = '';

        if (skills.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No skills listed yet.</p>';
            return;
        }

        skills.forEach(skill => {
            const tag = document.createElement('div');
            tag.className = 'skill-tag verified';
            tag.textContent = skill;
            container.appendChild(tag);
        });
    }

    function renderBarters(barters) {
        const container = document.getElementById('profile-barters');
        if (!container) return;
        container.innerHTML = '';

        if (barters.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No active barter offers.</p>';
            return;
        }

        barters.forEach(item => {
            const div = document.createElement('div');
            div.className = 'glass-card';
            div.style.padding = '1rem';
            div.style.marginBottom = '1rem';
            div.innerHTML = `<strong>${item.offer}</strong> for <em>${item.want}</em>`;
            container.appendChild(div);
        });
    }

    // --- Add Skill Logic ---
    const addSkillBtn = document.getElementById('add-skill-btn');
    const addSkillForm = document.getElementById('add-skill-form');
    const cancelSkillBtn = document.getElementById('cancel-skill-btn');
    const saveSkillBtn = document.getElementById('save-skill-btn');
    const newSkillInput = document.getElementById('new-skill-input');

    if (addSkillBtn) {
        addSkillBtn.addEventListener('click', () => {
            addSkillForm.classList.remove('hidden');
        });
    }

    if (cancelSkillBtn) {
        cancelSkillBtn.addEventListener('click', () => {
            addSkillForm.classList.add('hidden');
            newSkillInput.value = '';
        });
    }

    if (saveSkillBtn) {
        saveSkillBtn.addEventListener('click', async () => {
            const newSkill = newSkillInput.value.trim();
            if (!newSkill) return;

            const loggedInUser = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
            const currentSkills = Array.isArray(loggedInUser.skills) ? loggedInUser.skills : [];
            const updatedSkills = [...currentSkills, newSkill];

            try {
                const res = await fetch(`${API_BASE}/user/${loggedInUser.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ skills: updatedSkills })
                });

                if (res.ok) {
                    const updatedUser = await res.json();
                    localStorage.setItem('loggedInUser', JSON.stringify(updatedUser));
                    renderSkills(updatedUser.skills);
                    addSkillForm.classList.add('hidden');
                    newSkillInput.value = '';
                }
            } catch (err) {
                console.error('Error saving skill', err);
            }
        });
    }

    // --- Edit Bio Logic ---
    const editBioBtn = document.getElementById('edit-bio-btn');
    const profileBio = document.getElementById('profile-bio');

    if (editBioBtn && profileBio) {
        editBioBtn.addEventListener('click', async () => {
            const currentBio = profileBio.textContent;
            const newBio = prompt("Enter your new bio:", currentBio);

            if (newBio !== null && newBio !== currentBio) {
                const loggedInUser = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
                try {
                    const res = await fetch(`${API_BASE}/user/${loggedInUser.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bio: newBio })
                    });

                    if (res.ok) {
                        const updatedUser = await res.json();
                        localStorage.setItem('loggedInUser', JSON.stringify(updatedUser));
                        profileBio.textContent = updatedUser.bio;
                    }
                } catch (err) {
                    console.error('Error updating bio', err);
                }
            }
        });
    }

    initBackgroundAnimation();
});

function initBackgroundAnimation() {
    const canvas = document.getElementById("bg");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let particles = [];
    const colors = ["#f4728d", "#e5b7ad", "#ffbed1"]; // Theme Colors: Rose, Rose Gold, Blush Pink

    window.addEventListener("mousemove", e => {
        for (let i = 0; i < 4; i++) {
            particles.push({
                x: e.clientX,
                y: e.clientY,
                size: Math.random() * 5 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                dx: (Math.random() - 0.5) * 2,
                dy: (Math.random() - 0.5) * 2,
                life: 100
            });
        }
    });

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach((p, i) => {
            p.x += p.dx;
            p.y += p.dy;
            p.life--;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();

            if (p.life <= 0) particles.splice(i, 1);
        });

        requestAnimationFrame(animate);
    }

    animate();

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}
