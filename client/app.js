import translations from './translations.js';
let currentLang = 'en';

document.addEventListener('DOMContentLoaded', () => {
    try {

        // --- Robust Session Loading ---
        let loggedInUser = {};
        try {
            const storedUser = localStorage.getItem('loggedInUser');
            if (storedUser && storedUser !== "undefined" && storedUser !== "null") {
                loggedInUser = JSON.parse(storedUser);
            }
        } catch (e) {
            console.error('Error parsing loggedInUser from localStorage', e);
        }

        // --- Early Navigation Listeners ---
        document.querySelectorAll('.profile-trigger').forEach(el => {
            el.addEventListener('click', () => window.location.href = 'profile.html');
        });

        document.querySelectorAll('.skill-gap-trigger').forEach(el => {
            el.addEventListener('click', () => {
                localStorage.removeItem('targetCareer');
                window.location.href = 'skill-gap-finder.html';
            });
        });

        document.querySelectorAll('.barter-btn-trigger').forEach(el => {
            el.addEventListener('click', () => window.location.href = 'barter.html');
        });

        // --- Logout Logic (Top-Level) ---
        document.querySelectorAll('[onclick*="Logout"], .logout-btn, #logout-btn').forEach(el => {
            el.addEventListener('click', (e) => {
                // Ensure the logout happens even if other scripts fail
                console.log('Logging out...');
                localStorage.removeItem('loggedInUser');
                window.location.href = 'login.html';
            });
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
            try {
                if (typeof google !== 'undefined' && google.translate && google.translate.TranslateElement) {
                    new google.translate.TranslateElement({
                        pageLanguage: 'en',
                        includedLanguages: 'en,hi,ta,te,kn,mr',
                        layout: google.translate.TranslateElement.InlineLayout.SIMPLE
                    }, 'google_translate_element');
                }
            } catch (e) {
                console.error('Google Translate init failed', e);
            }
        };

        const gtScript = document.createElement('script');
        gtScript.type = 'text/javascript';
        gtScript.async = true;
        gtScript.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
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

                console.log('Login attempt for:', email);
                try {
                    const res = await fetch(`${API_BASE}/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });

                    const data = await res.json();
                    console.log('Login response:', res.status, data);
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

        // Logout handling

        // --- Profile Page Initialization ---
        if (window.location.pathname.includes('profile.html')) {
            if (!loggedInUser || !loggedInUser.id) {
                window.location.href = 'login.html';
                return;
            }
            loadProfile();
        }

        async function loadProfile() {
            const urlParams = new URLSearchParams(window.location.search);
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


        // --- Dynamic Personalized Roadmap Logic ---
        function initPersonalizedRoadmap() {
            const roadContainer = document.getElementById('skill-nodes-container');
            if (!roadContainer) return;

            const user = JSON.parse(localStorage.getItem('loggedInUser')) || {};
            const career = user.career_goal || localStorage.getItem('targetCareer') || 'General Growth';

            const roadmapData = {
                'Tailoring Specialist': [
                    { title: 'Business Mastery', desc: 'Learn how to market your skills, manage finances, and grow your local business.' },
                    { title: 'Advanced Embroidery', desc: 'Master intricate patterns, zardosi, and luxury garment construction.' },
                    { title: 'Garment Finishing', desc: 'Perfecting the final touches, buttons, and quality checks.' },
                    { title: 'Machine Maintenance', desc: 'Learning to service and maintain professional sewing equipment.' },
                    { title: 'Measurement Basics', desc: 'The foundations of accurate cutting and fitting for all body types.' }
                ],
                'Healthcare': [
                    { title: 'Community Leadership', desc: 'Become a trusted health educator and leader in your village.' },
                    { title: 'Emergency Response', desc: 'Advanced first aid, CPR, and critical care basics.' },
                    { title: 'Patient Care', desc: 'Understanding nutrition, hygiene, and patient communication.' },
                    { title: 'Medical Terminologies', desc: 'Learning the basic language used by doctors and clinics.' },
                    { title: 'First Aid Basics', desc: 'Fundamental wound care and vital sign monitoring.' }
                ],
                'Computer Science': [
                    { title: 'Advanced Coding', desc: 'Building complex applications and solving real-world problems.' },
                    { title: 'Web Development', desc: 'Mastering HTML, CSS, and interactive JavaScript.' },
                    { title: 'Digital Literacy', desc: 'Safe internet browsing, email etiquette, and online safety.' },
                    { title: 'Software Mastery', desc: 'Learning to use professional office and design software.' },
                    { title: 'Keyboard Typing', desc: 'The very beginning: Building speed and accuracy on the keyboard.' }
                ]
            };

            // Fallback generic roadmap
            const milestones = roadmapData[career] || [
                { title: 'Leadership & Scaling', desc: 'Learn to mentor others and expand your reach in the community.' },
                { title: 'Professional Polish', desc: 'Master the high-level details that make your work stand out.' },
                { title: 'Digital Expansion', desc: 'Take your skills online to find new clients and opportunities.' },
                { title: 'Core Competency', desc: 'Perfecting the essential technical skills for your chosen path.' },
                { title: 'Foundations', desc: 'Starting your journey with the right tools and mindset.' }
            ];

            roadContainer.innerHTML = '';
            milestones.forEach((m, i) => {
                const node = document.createElement('div');
                node.className = 'skill-node';
                node.innerHTML = m.title;
                node.onclick = () => showDetails(m.title, m.desc);
                roadContainer.appendChild(node);
            });

            // Update titles
            const goalText = document.getElementById('goal-text');
            const goalSub = document.getElementById('goal-subtext');
            if (goalText) goalText.innerText = `🎯 Goal: ${career}`;
            if (goalSub) goalSub.innerText = `From learning basics to becoming a master ${career.toLowerCase()}.`;
        }

        // Expose showDetails to global scope for the nodes
        window.showDetails = function (title, desc) {
            const box = document.getElementById('details-box');
            const titleEl = document.getElementById('skill-title');
            const descEl = document.getElementById('skill-desc');
            if (box && titleEl && descEl) {
                titleEl.innerText = title;
                descEl.innerText = desc;
                box.classList.add('active');
            }
        };

        window.closeDetails = function () {
            const box = document.getElementById('details-box');
            if (box) box.classList.remove('active');
        };

        if (window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/')) {
            initPersonalizedRoadmap();
        }

        // --- Skill Exchange (Barter) Logic ---
        function initBarter() {
            const findMatchesBtn = document.getElementById('find-matches-btn');
            const barterList = document.getElementById('barter-list');
            const matchList = document.getElementById('match-list');
            const postListingBtn = document.getElementById('post-listing-btn');

            // --- Case: barter.html (Search page) ---
            if (findMatchesBtn) {
                findMatchesBtn.addEventListener('click', () => {
                    const offer = document.getElementById('teach-skill').value.trim();
                    const want = document.getElementById('learn-skill').value.trim();
                    const location = document.getElementById('location').value.trim();
                    const mode = document.getElementById('teaching-mode').value;

                    if (!offer || !want) {
                        alert("Please enter both skills to find a match.");
                        return;
                    }

                    // Save search params and redirect
                    localStorage.setItem('barterSearch', JSON.stringify({ offer, want, location, mode }));
                    window.location.href = 'barter-results.html';
                });
            }

            // --- Case: barter-results.html (Results page) ---
            if (matchList || barterList) {
                loadAllBarters();
                const searchParams = JSON.parse(localStorage.getItem('barterSearch') || 'null');

                if (searchParams) {
                    // Fill the summary bar
                    const summaryTeach = document.getElementById('summary-teach');
                    const summaryLearn = document.getElementById('summary-learn');
                    const summaryMode = document.getElementById('summary-mode');

                    if (summaryTeach) summaryTeach.textContent = searchParams.offer;
                    if (summaryLearn) summaryLearn.textContent = searchParams.want;
                    if (summaryMode) summaryMode.textContent = `(${searchParams.mode})`;

                    loadMatches(searchParams);
                } else {
                    // If no search, show empty state or hide match card
                    const matchCard = document.getElementById('match-results-card');
                    if (matchCard) matchCard.style.display = 'none';
                }
            }

            if (postListingBtn) {
                postListingBtn.addEventListener('click', postOffer);
            }
        }

        async function loadAllBarters() {
            const barterList = document.getElementById('barter-list');
            if (!barterList) return;

            try {
                const res = await fetch(`${API_BASE}/barter`);
                const data = await res.json();
                renderBarterList(data, barterList);
            } catch (err) {
                console.error('Error loading all barters', err);
            }
        }

        async function loadMatches(params) {
            const matchList = document.getElementById('match-list');
            if (!matchList) return;

            try {
                const res = await fetch(`${API_BASE}/barter/match`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mySkill: params.offer,
                        targetSkill: params.want,
                        userId: loggedInUser?.id
                    })
                });
                const data = await res.json();
                renderBarterList(data, matchList, true);

                // Update subtitle if matches found
                const matchSubtitle = document.getElementById('match-subtitle');
                if (matchSubtitle) {
                    matchSubtitle.textContent = data.length > 0
                        ? `We found ${data.length} people matches based on your skills!`
                        : "No exact matches yet, but we've posted your offer for others to see!";
                }
            } catch (err) {
                console.error('Error loading matches', err);
            }
        }

        async function postOffer() {
            const searchParams = JSON.parse(localStorage.getItem('barterSearch') || 'null');
            if (!searchParams) {
                alert("Please search for a match first to define your offer!");
                window.location.href = 'barter.html';
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/barter`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        offer: searchParams.offer,
                        want: searchParams.want,
                        location: searchParams.location,
                        teaching_mode: searchParams.mode,
                        user_id: loggedInUser?.id
                    })
                });

                if (res.ok) {
                    alert("Your offer has been posted successfully!");
                    loadAllBarters();
                }
            } catch (err) {
                console.error('Error posting offer', err);
            }
        }

        function renderBarterList(items, container, isMatch = false) {
            container.innerHTML = '';
            if (!items.length) {
                container.innerHTML = `<div class="empty-state"><p>No listings found.</p></div>`;
                return;
            }

            items.forEach(item => {
                const card = document.createElement('div');
                card.className = 'glass-card barter-item';
                card.style.padding = '1rem';
                card.style.marginBottom = '1rem';
                card.style.borderLeft = isMatch ? '4px solid var(--terracotta)' : '4px solid var(--secondary)';

                const userName = (item.users && item.users.name) ? item.users.name : 'Verified User';

                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4 style="color: var(--secondary); margin-bottom: 0.3rem;">${userName}</h4>
                            <p style="font-size: 0.9rem;"><strong>Teaches:</strong> ${item.offer}</p>
                            <p style="font-size: 0.9rem;"><strong>Wants:</strong> ${item.want}</p>
                            <div style="margin-top: 0.5rem; font-size: 0.8rem; opacity: 0.7;">
                                📍 ${item.location || 'Remote'} | 💻 ${item.teaching_mode}
                            </div>
                        </div>
                        <button class="btn-secondary view-profile-btn" style="padding: 0.5rem 1rem; font-size: 0.8rem;" data-user-id="${item.user_id}">View Profile</button>
                    </div>
                `;
                container.appendChild(card);
            });

            // Add listeners for View Profile buttons
            container.querySelectorAll('.view-profile-btn').forEach(btn => {
                btn.addEventListener('click', () => openProfilePopup(btn.dataset.userId));
            });
        }

        async function openProfilePopup(userId) {
            const modal = document.getElementById('profile-modal');
            if (!modal) return;

            // Store the user ID for the send-request button
            modal.dataset.viewedUserId = userId;

            // Show loader state if possible or just open
            modal.classList.remove('hidden');

            try {
                const res = await fetch(`${API_BASE}/user/${userId}`);
                const user = await res.json();

                // Populate modal
                document.getElementById('modal-profile-name').textContent = user.name || 'Verified User';
                document.getElementById('modal-profile-bio').textContent = user.bio || 'Professional in growth';
                document.getElementById('modal-profile-location').textContent = `📍 ${user.location || 'India'}`;

                const goalEl = document.getElementById('modal-career-goal');
                if (goalEl) {
                    goalEl.textContent = user.career_goal || 'Exploring Career Paths';
                    goalEl.style.display = user.career_goal ? 'inline-block' : 'none';
                }

                const imgEl = document.getElementById('modal-profile-img');
                if (imgEl) imgEl.src = user.profile_img || 'default-avatar.png';

                // Populate skills
                const skillsContainer = document.getElementById('modal-profile-skills');
                if (skillsContainer) {
                    skillsContainer.innerHTML = '';
                    (user.skills || []).forEach(skill => {
                        const tag = document.createElement('span');
                        tag.className = 'skill-tag verified';
                        tag.style.fontSize = '0.8rem';
                        tag.textContent = skill;
                        skillsContainer.appendChild(tag);
                    });
                }

                // Fetch and show rating in modal
                const ratingDisplay = document.getElementById('modal-rating-display');
                if (ratingDisplay) {
                    try {
                        const ratingRes = await fetch(`${API_BASE}/ratings/${userId}`);
                        const ratingData = await ratingRes.json();
                        if (ratingData.count > 0) {
                            const fullStars = Math.floor(ratingData.average);
                            const stars = '★'.repeat(fullStars) + '☆'.repeat(5 - fullStars);
                            ratingDisplay.innerHTML = `<span class="stars">${stars}</span> <span class="count">${ratingData.average} (${ratingData.count} reviews)</span>`;
                        } else {
                            ratingDisplay.innerHTML = `<span class="count">No ratings yet</span>`;
                        }
                    } catch (e) {
                        ratingDisplay.innerHTML = '';
                    }
                }

                // Configure send-request button
                const sendReqBtn = document.getElementById('send-request-btn');
                if (sendReqBtn) {
                    // Hide if viewing own profile
                    if (loggedInUser && loggedInUser.id == userId) {
                        sendReqBtn.style.display = 'none';
                    } else {
                        sendReqBtn.style.display = 'flex';
                        sendReqBtn.disabled = false;
                        sendReqBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg> Send Request`;
                    }
                }

            } catch (err) {
                console.error('Error opening profile popup', err);
            }
        }

        // Send Request button handler
        const sendReqBtn = document.getElementById('send-request-btn');
        if (sendReqBtn) {
            sendReqBtn.addEventListener('click', async () => {
                const modal = document.getElementById('profile-modal');
                const toUserId = modal?.dataset.viewedUserId;

                if (!toUserId || !loggedInUser?.id) {
                    showToast('Please log in to send requests', 'error');
                    return;
                }

                sendReqBtn.disabled = true;
                sendReqBtn.textContent = 'Sending...';

                try {
                    const res = await fetch(`${API_BASE}/barter-requests`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            from_user_id: loggedInUser.id,
                            to_user_id: parseInt(toUserId),
                            message: 'I would like to exchange skills with you!'
                        })
                    });

                    if (res.status === 409) {
                        showToast('You already have a pending request to this user', 'info');
                    } else if (res.ok) {
                        showToast('Request sent successfully! ✨', 'success');
                        sendReqBtn.innerHTML = '✓ Request Sent';
                    } else {
                        const data = await res.json();
                        showToast(data.error || 'Failed to send request', 'error');
                        sendReqBtn.disabled = false;
                        sendReqBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg> Send Request`;
                    }
                } catch (err) {
                    console.error('Error sending request', err);
                    showToast('Connection error. Please try again.', 'error');
                    sendReqBtn.disabled = false;
                }
            });
        }

        // ── Barter Requests & Ratings Management ──

        async function loadBarterRequests(userId) {
            const incomingList = document.getElementById('incoming-requests');
            const outgoingList = document.getElementById('outgoing-requests');
            const countBadge = document.getElementById('request-count-badge');

            if (!incomingList || !outgoingList) return;

            try {
                const res = await fetch(`${API_BASE}/barter-requests/${userId}`);
                const data = await res.json();

                // Render Incoming
                if (data.incoming.length === 0) {
                    incomingList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; padding: 1rem;">No incoming requests yet.</p>';
                    if (countBadge) countBadge.style.display = 'none';
                } else {
                    if (countBadge) {
                        const pendingCount = data.incoming.filter(r => r.status === 'pending').length;
                        if (pendingCount > 0) {
                            countBadge.textContent = pendingCount;
                            countBadge.style.display = 'inline-flex';
                        } else {
                            countBadge.style.display = 'none';
                        }
                    }

                    incomingList.innerHTML = data.incoming.map(req => `
                        <div class="request-card status-${req.status}">
                            <img src="${req.from_user.profile_img || 'default-avatar.png'}" class="request-avatar">
                            <div class="request-info">
                                <h4>${req.from_user.name}</h4>
                                <p>${req.message}</p>
                                <span class="request-status-badge ${req.status}">${req.status}</span>
                            </div>
                            ${req.status === 'pending' ? `
                                <div class="request-actions">
                                    <button class="accept-btn" onclick="handleRequest(${req.id}, 'accepted')">Accept</button>
                                    <button class="reject-btn" onclick="handleRequest(${req.id}, 'rejected')">Reject</button>
                                </div>
                            ` : ''}
                        </div>
                    `).join('');
                }

                // Render Outgoing
                if (data.outgoing.length === 0) {
                    outgoingList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; padding: 1rem;">You haven\'t sent any requests.</p>';
                } else {
                    outgoingList.innerHTML = data.outgoing.map(req => `
                        <div class="request-card status-${req.status}">
                            <img src="${req.to_user.profile_img || 'default-avatar.png'}" class="request-avatar">
                            <div class="request-info">
                                <h4>To: ${req.to_user.name}</h4>
                                <p>${req.message}</p>
                                <span class="request-status-badge ${req.status}">${req.status}</span>
                            </div>
                        </div>
                    `).join('');
                }

            } catch (err) {
                console.error('Error loading requests:', err);
            }
        }

        window.handleRequest = async function (requestId, status) {
            try {
                const res = await fetch(`${API_BASE}/barter-requests/${requestId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status })
                });

                if (res.ok) {
                    showToast(`Request ${status} successfully`, 'success');
                    if (loggedInUser?.id) loadBarterRequests(loggedInUser.id);
                }
            } catch (err) {
                console.error('Error handling request:', err);
                showToast('Failed to update request', 'error');
            }
        };

        // --- Rating System ---
        let selectedRating = 0;

        function initRatingSystem() {
            const stars = document.querySelectorAll('.star-btn');
            stars.forEach(star => {
                star.addEventListener('mouseover', function () {
                    const val = parseInt(this.dataset.value);
                    stars.forEach(s => {
                        if (parseInt(s.dataset.value) <= val) s.classList.add('hovered');
                        else s.classList.remove('hovered');
                    });
                });

                star.addEventListener('mouseleave', () => {
                    stars.forEach(s => s.classList.remove('hovered'));
                });

                star.addEventListener('click', function () {
                    selectedRating = parseInt(this.dataset.value);
                    stars.forEach(s => {
                        if (parseInt(s.dataset.value) <= selectedRating) s.classList.add('active');
                        else s.classList.remove('active');
                    });
                });
            });

            const submitBtn = document.getElementById('submit-rating-btn');
            if (submitBtn) {
                submitBtn.addEventListener('click', async () => {
                    const reviewText = document.getElementById('review-text').value;
                    const urlParams = new URLSearchParams(window.location.search);
                    const toUserId = urlParams.get('id');

                    if (!selectedRating) {
                        showToast('Please select a star rating', 'error');
                        return;
                    }

                    if (!loggedInUser?.id) {
                        showToast('Please log in to rate users', 'error');
                        return;
                    }

                    try {
                        const res = await fetch(`${API_BASE}/ratings`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                from_user_id: loggedInUser.id,
                                to_user_id: parseInt(toUserId),
                                rating: selectedRating,
                                review: reviewText
                            })
                        });

                        if (res.ok) {
                            showToast('Rating submitted! Thank you.', 'success');
                            loadRatings(toUserId);
                            document.getElementById('review-text').value = '';
                        }
                    } catch (err) {
                        console.error('Error submitting rating:', err);
                        showToast('Failed to submit rating', 'error');
                    }
                });
            }
        }

        async function loadRatings(userId) {
            const avgRatingEl = document.getElementById('avg-rating');
            const avgStarsEl = document.getElementById('avg-stars');
            const ratingCountEl = document.getElementById('rating-count');
            const reviewsList = document.getElementById('reviews-list');

            if (!reviewsList) return;

            try {
                const res = await fetch(`${API_BASE}/ratings/${userId}`);
                const data = await res.json();

                if (data.count > 0) {
                    if (avgRatingEl) avgRatingEl.textContent = data.average;
                    if (avgStarsEl) {
                        const fullStars = Math.floor(data.average);
                        avgStarsEl.textContent = '★'.repeat(fullStars) + '☆'.repeat(5 - fullStars);
                    }
                    if (ratingCountEl) ratingCountEl.textContent = `Based on ${data.count} reviews`;

                    reviewsList.innerHTML = data.ratings.map(r => `
                        <div class="review-card">
                            <img src="${r.from_user.profile_img || 'default-avatar.png'}" class="review-avatar">
                            <div class="review-body">
                                <div class="review-header">
                                    <h5>${r.from_user.name}</h5>
                                    <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
                                </div>
                                <p>${r.review || 'No comment left.'}</p>
                            </div>
                        </div>
                    `).join('');
                } else {
                    if (avgRatingEl) avgRatingEl.textContent = '—';
                    if (ratingCountEl) ratingCountEl.textContent = 'No ratings yet';
                    reviewsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; padding: 1rem;">Be the first to rate this user!</p>';
                }
            } catch (err) {
                console.error('Error loading ratings:', err);
            }
        }

        // --- Tab Switching for Requests ---
        const tabIncoming = document.getElementById('tab-incoming');
        const tabOutgoing = document.getElementById('tab-outgoing');
        const listIncoming = document.getElementById('incoming-requests');
        const listOutgoing = document.getElementById('outgoing-requests');

        if (tabIncoming && tabOutgoing) {
            tabIncoming.onclick = () => {
                tabIncoming.classList.add('active');
                tabOutgoing.classList.remove('active');
                listIncoming.style.display = 'flex';
                listOutgoing.style.display = 'none';
            };
            tabOutgoing.onclick = () => {
                tabOutgoing.classList.add('active');
                tabIncoming.classList.remove('active');
                listOutgoing.style.display = 'flex';
                listIncoming.style.display = 'none';
            };
        }

        // Initialize and check current user context
        if (window.location.pathname.includes('profile.html')) {
            const urlParams = new URLSearchParams(window.location.search);
            const viewUserId = urlParams.get('id') || loggedInUser?.id;
            const isOwnProfile = !urlParams.get('id') || urlParams.get('id') == loggedInUser?.id;

            if (isOwnProfile && loggedInUser?.id) {
                const reqSection = document.getElementById('requests-section');
                if (reqSection) reqSection.style.display = 'block';
                loadBarterRequests(loggedInUser.id);
            } else if (viewUserId) {
                const rateCard = document.getElementById('rate-user-card');
                if (rateCard) rateCard.style.display = 'block';
                initRatingSystem();
            }

            if (viewUserId) {
                loadRatings(viewUserId);
            }
        }

        // Close Modal Logic
        const closeBtn = document.getElementById('close-profile-modal');
        const modal = document.getElementById('profile-modal');
        if (closeBtn && modal) {
            closeBtn.onclick = () => modal.classList.add('hidden');
            window.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.add('hidden');
            });
        }

        // Initialize Barter
        initBarter();

        initBackgroundAnimation();
    } catch (e) {
        console.error('Critical initialization error in app.js', e);
    }
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
