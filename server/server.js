const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : null;

const multer = require('multer');
const axios = require('axios');
const fs = require('fs');


const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MISTRAL_MODEL = "mistralai/Mistral-7B-Instruct-v0.2";
const LLAMA_MODEL = "meta-llama/Meta-Llama-3-8B-Instruct";
const WHISPER_MODEL = "openai/whisper-large-v3";


const upload = multer({ storage: multer.memoryStorage() });


const checkDb = (res) => {
    if (!supabase) {
        res.status(503).json({
            error: "Database not connected. Please provide SUPABASE_URL and SUPABASE_KEY in .env file."
        });
        return false;
    }
    return true;
};



const queryAI = async (model, data, isBinary = false) => {
    if (!HF_TOKEN) {
        console.warn(`HF_TOKEN missing. Falling back to mock for ${model}`);
        return getMockResponse(model, data);
    }

    try {
        const response = await axios({
            url: `https://api-inference.huggingface.co/models/${model}`,
            method: 'POST',
            headers: { Authorization: `Bearer ${HF_TOKEN}` },
            data: isBinary ? data : JSON.stringify(data),
            responseType: isBinary ? 'arraybuffer' : 'json'
        });

        let result = response.data;
        if (isBinary || response.headers['content-type']?.includes('application/octet-stream')) {
            try {
                // Try parsing as JSON first in case of error messages returned as binary
                const text = Buffer.from(response.data).toString();
                result = JSON.parse(text);
            } catch (e) {
                // If it's real binary (like audio), keep as is
                if (!isBinary) result = response.data;
            }
        }

        return result;
    } catch (err) {
        let errorMsg = err.message;
        if (err.response?.data instanceof Buffer) {
            try {
                const parsed = JSON.parse(err.response.data.toString());
                errorMsg = parsed.error || errorMsg;
            } catch (e) { }
        } else if (err.response?.data?.error) {
            errorMsg = err.response.data.error;
        }

        console.error(`AI API Error (${model}):`, errorMsg);
        return getMockResponse(model, data);
    }
};

const getMockResponse = (model, data) => {
    console.log(`Using mock response for ${model}`);
    if (model.includes('whisper')) {
        return { text: "This is a simulated transcription. (API Token might be invalid or model loading)" };
    }
    if (data.inputs && data.inputs.includes('Generate ONE practical interview question')) {
        const questions = [
            "Can you describe a time when you successfully solved a problem in your community?",
            "How would you handle a situation where you had to learn a new skill quickly?",
            "Tell us about a time you worked as part of a team to achieve a common goal."
        ];
        return [{ generated_text: questions[Math.floor(Math.random() * questions.length)] }];
    }
    if (data.inputs && data.inputs.includes('Evaluate this answer for')) {
        return [{ generated_text: "SCORE: 8\nFEEDBACK: Great job! Your answer was clear and practical." }];
    }
    return [{ generated_text: "This is a simulated AI response." }];
};


const preWarmAI = () => {
    if (!HF_TOKEN) return console.log("⚠️ HF_TOKEN missing. AI features will be limited.");
    console.log("🚀 Pre-warming AI Models...");
    queryAI(MISTRAL_MODEL, { inputs: "Hello" }).catch(() => { });
    queryAI(LLAMA_MODEL, { inputs: "Hello" }).catch(() => { });
    queryAI(WHISPER_MODEL, Buffer.alloc(0), true).catch(() => { });
};
preWarmAI();




app.post('/api/ai/ask', async (req, res) => {
    const { skills, career, history, modelType } = req.body;
    const model = modelType === 'mistral' ? MISTRAL_MODEL : LLAMA_MODEL;

    const skillList = Array.isArray(skills) ? skills : (skills || "").split(',').map(s => s.trim()).filter(Boolean);

    let prompt = "";
    if (modelType === 'mistral') {
        prompt = `<s>[INST] You are an encouraging interview coach for women in India. 
${skills ? `Candidate's skills: ${skills}.` : ''}
${career ? `Target Career: ${career}.` : ''}
Generate ONE practical interview question to test career readiness.
Do NOT repeat: ${history?.join(' | ') || 'none'}.
REPLY WITH ONLY THE QUESTION. [/INST]`;
    } else {
        if (career || skillList.length > 0) {
            prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are an AI career coach for women in India. ${career ? `The user is interested in: ${career}.` : ''} ${skillList.length > 0 ? `The user has these skills: ${skillList.join(', ')}.` : ''}
Generate ONE smart, practical interview question related to this career path and these skills. 
Keep it warm and encouraging. Previous questions: ${history?.join(', ') || 'None'}.
REPLY ONLY WITH THE QUESTION TEXT.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
        } else {
            prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are an AI career coach. Ask ONE general soft-skill question to help the user find their path.
Previous questions: ${history?.join(', ') || 'None'}.
REPLY ONLY WITH THE QUESTION TEXT.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
        }
    }

    try {
        const response = await queryAI(model, {
            inputs: prompt,
            parameters: { max_new_tokens: 150, temperature: 0.7 }
        });
        let question = Array.isArray(response) ? response[0].generated_text : (response.generated_text || "Tell me about a time you solved a problem with a neighbor or friend?");


        question = question.replace(prompt, "").trim().split('\n')[0];
        res.json({ question });
    } catch (err) {
        res.json({ question: "How do you think your skills can help your village grow?" });
    }
});


app.post('/api/ai/transcribe', upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No audio file provided" });

    try {
        const response = await queryAI(WHISPER_MODEL, req.file.buffer, true);
        res.json({ text: response.text || "I'm sorry, I couldn't hear that clearly. Could you try again?" });
    } catch (err) {
        res.status(500).json({ error: "Transcription failed" });
    }
});


app.post('/api/ai/assess', async (req, res) => {
    const { question, answer, modelType } = req.body;
    const model = modelType === 'mistral' ? MISTRAL_MODEL : LLAMA_MODEL;

    let prompt = "";
    if (modelType === 'mistral') {
        prompt = `<s>[INST] You are an expert interview evaluator. 
Question asked: "${question}"
Candidate's answer: "${answer}"

Evaluate this answer for:
- Communication clarity
- Relevance
- Confidence indicators
- Practical examples

Respond ONLY in this exact format:
SCORE: [number 0-10]
FEEDBACK: [one encouraging sentence of feedback] [/INST]`;
    } else {
        prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are an expert interview evaluator. 
Question asked: "${question}"
Candidate's answer: "${answer}"

Provide a score from 0 to 10 and a short (1 sentence) piece of encouraging feedback.
Output format: SCORE|FEEDBACK<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
    }

    try {
        const response = await queryAI(model, {
            inputs: prompt,
            parameters: { max_new_tokens: 100, temperature: 0.5 }
        });
        const output = Array.isArray(response) ? response[0].generated_text : (response.generated_text || "");
        const cleanOutput = output.replace(prompt, "").trim();

        let score = 7;
        let feedback = "That's a very thoughtful answer, Rani!";

        if (modelType === 'mistral') {
            const scoreMatch = cleanOutput.match(/SCORE:\s*(\d+)/i);
            const feedbackMatch = cleanOutput.match(/FEEDBACK:\s*(.+)/is);
            score = scoreMatch ? Math.min(10, parseInt(scoreMatch[1])) : 7;
            feedback = feedbackMatch ? feedbackMatch[1].trim().split('\n')[0] : feedback;
        } else {
            const [s, ...fParts] = cleanOutput.split('|');
            score = parseInt(s) || 7;
            feedback = fParts.join('|') || feedback;
        }

        res.json({ score, feedback });
    } catch (err) {
        res.json({ score: 5, feedback: "Keep going, your confidence is growing!" });
    }
});


app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});




app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;


    if (!supabase) {

        if (email === 'john@example.com' && password === '1234567890') {
            const mockUser = {
                id: 1,
                name: 'Rani Priya',
                email: 'john@example.com',
                skills: ['Tailoring', 'Cooking'],
                location: 'Bangalore',
                bio: 'Mother of 2, loves helping people',
                career_goal: 'Tailoring Specialist'
            };
            res.json({ user: mockUser });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
        return;
    }

    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);

        if (error) throw error;

        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = users[0];

        if (user.password !== password) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const { password: _, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});


app.post('/api/jobs', async (req, res) => {
    if (!checkDb(res)) return;
    const { skills } = req.body;

    try {
        const { data: jobs, error } = await supabase
            .from('jobs')
            .select('*');

        if (error) throw error;


        const skillSynonyms = {
            'cooking': ['cooking', 'catering', 'chef', 'सिलाई', 'சமையல்', 'food'],
            'sewing': ['sewing', 'tailoring', 'embroidery', 'सिलाई', 'தையல்', 'stitching'],
            'teaching': ['teaching', 'education', 'mentor', 'शिक्षण', 'ஆசிரியர்'],
            'computer': ['computer', 'digital', 'typing', 'कंप्यूटर', 'கணினி'],
            'farming': ['farming', 'agriculture', 'organic', 'खेती', 'விவசாயம்']
        };

        const expandSkills = (skillList) => {
            let expanded = [...skillList];
            skillList.forEach(s => {
                for (const [key, synonyms] of Object.entries(skillSynonyms)) {
                    if (synonyms.includes(s.toLowerCase()) || s.toLowerCase().includes(key)) {
                        expanded = [...new Set([...expanded, ...synonyms])];
                    }
                }
            });
            return expanded.map(s => s.toLowerCase());
        };

        const skillSource = Array.isArray(skills) ? skills.join(', ') : (skills || "");
        const userSkillsExpanded = expandSkills(skillSource.toLowerCase().split(',').map(s => s.trim()));

        const matchedJobs = jobs.map(job => {
            let reqSkills = [];
            try {

                reqSkills = Array.isArray(job.required_skills)
                    ? job.required_skills
                    : (typeof job.required_skills === 'string' ? JSON.parse(job.required_skills) : []);
            } catch (e) { reqSkills = []; }

            const reqSkillsLower = reqSkills.map(s => s.toLowerCase());
            const matches = reqSkillsLower.filter(s => userSkillsExpanded.some(us => us.includes(s) || s.includes(us)));

            const matchCount = matches.length;
            const matchPercentage = Math.round((matchCount / Math.max(reqSkills.length, 1)) * 100);
            const missingSkills = reqSkills.filter(s => !userSkillsExpanded.some(us => us.includes(s.toLowerCase()) || s.toLowerCase().includes(us)));

            return {
                ...job,
                match: matchPercentage,
                matches,
                missing_skills: missingSkills
            };
        })
            .filter(j => j.match > 0 || j.missing_skills.length <= 4)
            .sort((a, b) => b.match - a.match)
            .slice(0, 6);

        res.json(matchedJobs);
    } catch (err) {
        console.error('Error fetching jobs:', err);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

app.post('/api/roadmap', async (req, res) => {
    if (!checkDb(res)) return;
    const { jobId } = req.body;

    try {
        const { data: courses, error } = await supabase
            .from('courses')
            .select('*');

        if (error) throw error;

        const roadmap = {
            job: "Selected Role",
            progress: 40,
            skills: [
                { name: "Core Skill", status: "verified" },
                ...courses.map(c => ({
                    name: c.name,
                    status: "pending",
                    course: `${c.provider} Course`,
                    duration: c.duration,
                    link: c.link
                }))
            ]
        };

        res.json(roadmap);
    } catch (err) {
        console.error('Error fetching roadmap:', err);
        res.status(500).json({ error: 'Failed to generate roadmap' });
    }
});

app.post('/api/assess', async (req, res) => {
    const { response } = req.body;
    const feedback = "Great approach! You show strong empathy and practical thinking.";
    const score = 85;
    res.json({ score, feedback });
});

app.post('/api/verify', async (req, res) => {
    res.json({ status: "pending", message: "Verification request submitted." });
});




app.get('/api/roadmap/:userId', async (req, res) => {
    if (!checkDb(res)) return;
    const { userId } = req.params;
    try {
        const { data, error } = await supabase
            .from('roadmap')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error fetching roadmap:', err);
        res.status(500).json({ error: 'Failed to fetch roadmap' });
    }
});


app.post('/api/roadmap', async (req, res) => {
    if (!checkDb(res)) return;
    const { user_id, skill_name, course_name, course_provider, course_link, target_date, notes } = req.body;

    if (!user_id || !skill_name) {
        return res.status(400).json({ error: 'user_id and skill_name are required' });
    }

    try {
        const { data, error } = await supabase
            .from('roadmap')
            .insert([{ user_id, skill_name, course_name, course_provider, course_link, target_date, notes }])
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error adding to roadmap:', err);
        res.status(500).json({ error: 'Failed to add to roadmap' });
    }
});


app.patch('/api/roadmap/:id', async (req, res) => {
    if (!checkDb(res)) return;
    const { id } = req.params;
    const updates = req.body;

    try {
        const { data, error } = await supabase
            .from('roadmap')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error updating roadmap entry:', err);
        res.status(500).json({ error: 'Failed to update roadmap' });
    }
});


app.delete('/api/roadmap/:id', async (req, res) => {
    if (!checkDb(res)) return;
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('roadmap')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting roadmap entry:', err);
        res.status(500).json({ error: 'Failed to delete roadmap entry' });
    }
});




app.get('/api/barter', async (req, res) => {
    if (!checkDb(res)) return;
    try {
        const { data, error } = await supabase
            .from('barter')
            .select('*, users(id, name, skills, location, bio)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/barter', async (req, res) => {
    if (!checkDb(res)) return;
    const { offer, want, location, teaching_mode, user_id } = req.body;

    try {
        const { data, error } = await supabase
            .from('barter')
            .insert([{ offer, want, location, teaching_mode: teaching_mode || 'In-Person', user_id: user_id || null }])
            .select('*, users(id, name, skills, location, bio)');

        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/barter/match', async (req, res) => {
    if (!checkDb(res)) return;
    const { mySkill, targetSkill, userId } = req.body;

    if (!mySkill && !targetSkill) {
        return res.json([]);
    }

    try {
        let query = supabase
            .from('barter')
            .select('*, users(id, name, skills, location, bio)');

        if (mySkill && targetSkill) {


            query = query.or(`want.ilike.%${mySkill}%,offer.ilike.%${targetSkill}%`);
        } else if (mySkill) {
            query = query.ilike('want', `%${mySkill}%`);
        } else if (targetSkill) {
            query = query.ilike('offer', `%${targetSkill}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Match error:', error);
            return res.status(500).json({ error: error.message });
        }


        let matches = data
            .filter(item => !userId || item.user_id !== parseInt(userId))
            .map(item => {
                let score = 0;
                let matchedSkills = [];

                if (mySkill && item.want.toLowerCase().includes(mySkill.toLowerCase())) {
                    score += 2;
                    matchedSkills.push(mySkill);
                }
                if (targetSkill && item.offer.toLowerCase().includes(targetSkill.toLowerCase())) {
                    score += 1;
                    matchedSkills.push(targetSkill);
                }

                return { ...item, matchScore: score, matchedSkills };
            });


        matches.sort((a, b) => b.matchScore - a.matchScore);

        res.json(matches);
    } catch (err) {
        console.error('Match catch error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});


app.get('/api/user/:id', async (req, res) => {
    if (!checkDb(res)) return;
    const { id } = req.params;

    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, skills, location, bio, profile_img, career_goal, created_at')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!users) return res.status(404).json({ error: 'User not found' });


        const { data: barters } = await supabase
            .from('barter')
            .select('*')
            .eq('user_id', id)
            .order('created_at', { ascending: false });

        res.json({ ...users, barters: barters || [] });
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});


app.put('/api/user/:id', async (req, res) => {
    if (!checkDb(res)) return;
    const { id } = req.params;
    const updates = req.body;
    try {
        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id)
            .select('id, name, skills, location, bio, profile_img, career_goal')
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
});


app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});




app.get('/api/courses', async (req, res) => {
    if (!checkDb(res)) {

        res.json([
            {
                id: 1,
                name: 'Computer Literacy 101',
                provider: 'Google Digital Garage',
                duration: '4 Weeks',
                link: 'https://example.com/computer-literacy',
                rating: 4.2,
                reviews: 128,
                cost: 'Free',
                mode: 'Online'
            },
            {
                id: 2,
                name: 'Basic Healthcare Training',
                provider: 'Red Cross',
                duration: '3 Months',
                link: 'https://example.com/healthcare',
                rating: 4.5,
                reviews: 87,
                cost: '$50',
                mode: 'In-Person'
            }
        ]);
        return;
    }

    try {
        const { data: courses, error } = await supabase
            .from('courses')
            .select('*');

        if (error) throw error;
        res.json(courses);
    } catch (err) {
        console.error('Error fetching courses:', err);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});


app.get('/api/users/:userId/roadmap', async (req, res) => {
    const { userId } = req.params;

    if (!checkDb(res)) {

        res.json({
            user_id: userId,
            skills: [
                { name: 'Tailoring', status: 'completed', progress: 100 },
                { name: 'Cooking', status: 'completed', progress: 100 },
                { name: 'Computer Basics', status: 'in_progress', progress: 60 },
                { name: 'English Speaking', status: 'planned', progress: 0 }
            ],
            goals: [
                { title: 'Digital Trainer', required_skills: ['Computer Basics', 'Communication'] },
                { title: 'Community Health Worker', required_skills: ['Communication', 'Basic Health Knowledge'] }
            ]
        });
        return;
    }

    try {
        const { data: roadmap, error } = await supabase
            .from('roadmap')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        res.json(roadmap);
    } catch (err) {
        console.error('Error fetching roadmap:', err);
        res.status(500).json({ error: 'Failed to fetch roadmap' });
    }
});

// --- Smart Career Pathway & Persistence ---

app.post('/api/skill-gap/save', async (req, res) => {
    if (!checkDb(res)) return;
    const { userId, careerIntent, sessionData, totalScore } = req.body;

    try {
        const { data, error } = await supabase
            .from('interview_results')
            .insert([{
                user_id: userId,
                career_intent: careerIntent,
                session_data: sessionData,
                total_score: totalScore
            }])
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        console.error('Error saving interview results:', err);
        res.status(500).json({ error: 'Failed to save results' });
    }
});

app.post('/api/roadmap/generate', async (req, res) => {
    if (!checkDb(res)) return;
    const { userId, careerIntent, results } = req.body;

    try {
        // 1. Fetch available courses
        const { data: courses } = await supabase.from('courses').select('*');

        // 2. Map Career Intent to Suggested Courses (Smart Mapping)
        const careerMappings = {
            'tailoring': ['Advanced Embroidery'],
            'sewing': ['Advanced Embroidery'],
            'healthcare': ['Basic Healthcare Training'],
            'nurse': ['Basic Healthcare Training'],
            'computer': ['Computer Literacy 101', 'Typing Masterclass'],
            'data entry': ['Typing Masterclass', 'Computer Literacy 101'],
            'farming': ['Organic Farming Basics'],
            'agriculture': ['Organic Farming Basics'],
            'teaching': ['Child Development'],
            'solar': ['Solar Panel Installation']
        };

        let suggestedCourses = [];
        const intentLower = (careerIntent || "").toLowerCase();

        for (const [key, list] of Object.entries(careerMappings)) {
            if (intentLower.includes(key)) {
                suggestedCourses = list;
                break;
            }
        }

        // 3. Find missing skills from low scores (< 6)
        const gaps = results.filter(r => r.score < 6).map(r => r.question);

        // 4. Create Roadmap entries
        const roadmapEntries = [];

        // Add career-specific courses
        for (const courseName of suggestedCourses) {
            const course = courses.find(c => c.name === courseName);
            if (course) {
                roadmapEntries.push({
                    user_id: userId,
                    skill_name: intentLower || 'Career Goal',
                    course_name: course.name,
                    course_provider: course.provider,
                    course_link: course.link,
                    status: 'planned',
                    notes: 'Recommended based on your dream career.'
                });
            }
        }

        // Add soft skill/gap entries
        if (gaps.length > 0) {
            roadmapEntries.push({
                user_id: userId,
                skill_name: 'Core Soft Skills',
                status: 'planned',
                notes: `Based on your AI interview, focus on: ${gaps.slice(0, 2).join(', ')}.`
            });
        }

        if (roadmapEntries.length > 0) {
            const { error } = await supabase.from('roadmap').insert(roadmapEntries);
            if (error) throw error;
        }

        res.json({ success: true, roadmap: roadmapEntries });
    } catch (err) {
        console.error('Error generating roadmap:', err);
        res.status(500).json({ error: 'Failed to generate roadmap' });
    }
});

// ── Barter Connection Requests ──

app.post('/api/barter-requests', async (req, res) => {
    if (!checkDb(res)) return;
    const { from_user_id, to_user_id, barter_id, message } = req.body;

    if (!from_user_id || !to_user_id) {
        return res.status(400).json({ error: 'from_user_id and to_user_id are required' });
    }

    try {
        // Check for duplicate pending request
        const { data: existing } = await supabase
            .from('barter_requests')
            .select('id')
            .eq('from_user_id', from_user_id)
            .eq('to_user_id', to_user_id)
            .eq('status', 'pending');

        if (existing && existing.length > 0) {
            return res.status(409).json({ error: 'You already have a pending request to this user' });
        }

        const { data, error } = await supabase
            .from('barter_requests')
            .insert([{ from_user_id, to_user_id, barter_id: barter_id || null, message: message || '' }])
            .select('*, from_user:users!barter_requests_from_user_id_fkey(id, name, skills, location)')
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error creating barter request:', err);
        res.status(500).json({ error: 'Failed to send request' });
    }
});

app.get('/api/barter-requests/:userId', async (req, res) => {
    if (!checkDb(res)) return;
    const { userId } = req.params;

    try {
        // Get incoming requests (to this user)
        const { data: incoming, error: inErr } = await supabase
            .from('barter_requests')
            .select('*, from_user:users!barter_requests_from_user_id_fkey(id, name, skills, location, bio, profile_img)')
            .eq('to_user_id', userId)
            .order('created_at', { ascending: false });

        if (inErr) throw inErr;

        // Get outgoing requests (from this user)
        const { data: outgoing, error: outErr } = await supabase
            .from('barter_requests')
            .select('*, to_user:users!barter_requests_to_user_id_fkey(id, name, skills, location, bio, profile_img)')
            .eq('from_user_id', userId)
            .order('created_at', { ascending: false });

        if (outErr) throw outErr;

        res.json({ incoming: incoming || [], outgoing: outgoing || [] });
    } catch (err) {
        console.error('Error fetching barter requests:', err);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

app.patch('/api/barter-requests/:id', async (req, res) => {
    if (!checkDb(res)) return;
    const { id } = req.params;
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "accepted" or "rejected"' });
    }

    try {
        const { data, error } = await supabase
            .from('barter_requests')
            .update({ status })
            .eq('id', id)
            .select('*, from_user:users!barter_requests_from_user_id_fkey(id, name, email, skills, location, bio, profile_img)')
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error updating barter request:', err);
        res.status(500).json({ error: 'Failed to update request' });
    }
});

// ── User Ratings ──

app.post('/api/ratings', async (req, res) => {
    if (!checkDb(res)) return;
    const { from_user_id, to_user_id, rating, review } = req.body;

    if (!from_user_id || !to_user_id || !rating) {
        return res.status(400).json({ error: 'from_user_id, to_user_id, and rating are required' });
    }

    if (from_user_id === to_user_id) {
        return res.status(400).json({ error: 'You cannot rate yourself' });
    }

    try {
        // Upsert: update if already rated, insert if new
        const { data: existing } = await supabase
            .from('ratings')
            .select('id')
            .eq('from_user_id', from_user_id)
            .eq('to_user_id', to_user_id);

        let data, error;
        if (existing && existing.length > 0) {
            ({ data, error } = await supabase
                .from('ratings')
                .update({ rating, review: review || '' })
                .eq('id', existing[0].id)
                .select()
                .single());
        } else {
            ({ data, error } = await supabase
                .from('ratings')
                .insert([{ from_user_id, to_user_id, rating, review: review || '' }])
                .select()
                .single());
        }

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error submitting rating:', err);
        res.status(500).json({ error: 'Failed to submit rating' });
    }
});

app.get('/api/ratings/:userId', async (req, res) => {
    if (!checkDb(res)) return;
    const { userId } = req.params;

    try {
        const { data, error } = await supabase
            .from('ratings')
            .select('*, from_user:users!ratings_from_user_id_fkey(id, name, profile_img)')
            .eq('to_user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Calculate average
        const avg = data.length > 0
            ? (data.reduce((sum, r) => sum + r.rating, 0) / data.length).toFixed(1)
            : 0;

        res.json({ ratings: data || [], average: parseFloat(avg), count: data.length });
    } catch (err) {
        console.error('Error fetching ratings:', err);
        res.status(500).json({ error: 'Failed to fetch ratings' });
    }
});
app.post('/api/gemini/generate', async (req, res) => {
    try {
        if (!GEMINI_API_KEY) {
            return res.status(500).json({ error: 'Gemini API key not configured' });
        }

        const { prompt, maxOutputTokens = 200, temperature = 0.7 } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens, temperature }
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        res.json({ text });
    } catch (err) {
        console.error('Gemini proxy error:', err.message);
        res.status(500).json({ error: 'Gemini API request failed' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
