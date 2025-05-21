document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-message');
    const endScenarioButton = document.getElementById('end-scenario');
    const reportScamButton = document.getElementById('report-scam');
    const initiateCallButton = document.getElementById('initiate-call');
    const enableVoiceToggle = document.getElementById('enable-voice');
    const audioPlayer = document.getElementById('audio-player');
    const feedbackModal = document.getElementById('feedback-modal');
    const closeModal = document.querySelector('.close-modal');
    const retryScenarioButton = document.getElementById('retry-scenario');

    // Define missing variables with placeholders or default values
    let scenarioExplanationShown = false;
    let conversationStarted = false;
    let isProcessing = false;
    
    // Function to fetch and show scenario explanation
    async function showScenarioExplanation() {
        try {
            const response = await fetch('/api/scenario_explanation');
            if (!response.ok) {
                throw new Error('Failed to fetch scenario explanation');
            }
            const data = await response.json();
            
            // Build explanation content
            let explanationContent = `Scenario: ${data.name}\n\n`;
            explanationContent += `Description: ${data.description}\n\n`;
            explanationContent += `Red Flags:\n`;
            data.red_flags.forEach(flag => {
                explanationContent += `- ${flag}\n`;
            });
            explanationContent += `\nAI Persona: ${data.ai_persona}\n\n`;
            explanationContent += `AI Goals:\n`;
            data.ai_goals.forEach(goal => {
                explanationContent += `- ${goal}\n`;
            });
            explanationContent += `\nBest Practices:\n`;
            data.best_practices.forEach(practice => {
                explanationContent += `- ${practice}\n`;
            });
            
            // Show explanation in chat as system message
            addMessage('system', explanationContent);
            
            // Optionally, play audio of explanation if voice enabled
            // Disabled audio playback for scenario explanation as per user request
            // if (enableVoiceToggle.checked) {
            //     playAudioMessage(explanationContent);
            // }
            
            scenarioExplanationShown = true;
        } catch (error) {
            console.error('Error fetching scenario explanation:', error);
            addMessage('system', 'Failed to load scenario explanation.');
            scenarioExplanationShown = true; // proceed anyway
        }
    }
    
    // Start conversation with initial AI message
    async function startConversation() {
        if (conversationStarted) return;
        
        if (!scenarioExplanationShown) {
            await showScenarioExplanation();
        }
        
        conversationStarted = true;
        
        // Add initial AI message
        // Use the initial prompt from the backend scenario data
        addMessage('ai', initialPrompt);
        
        // Do NOT play audio for initial prompt as per user request
        // if (enableVoiceToggle.checked) {
        //     playAudioMessage(initialPrompt);
        // }
    }
    
    // Function to add message to chat
    function addMessage(sender, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        
        if (sender === 'user') {
            messageDiv.classList.add('user-message');
        } else if (sender === 'ai') {
            messageDiv.classList.add('ai-message');
        } else {
            messageDiv.classList.add('system-message');
        }
        
        messageDiv.textContent = content;
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Function to handle user message submission
    async function handleUserMessage() {
        if (isProcessing || !userInput.value.trim()) return;
        
        const userMessage = userInput.value.trim();
        
        // Clear input
        userInput.value = '';
        
        // Add user message to chat
        addMessage('user', userMessage);
        
        // Set processing state
        isProcessing = true;
        sendButton.disabled = true;
        
        try {
            // Show typing indicator
            const typingIndicator = document.createElement('div');
            typingIndicator.classList.add('message', 'ai-message', 'typing-indicator');
            typingIndicator.textContent = 'Typing...';
            chatMessages.appendChild(typingIndicator);
            
            // Make API request
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: userMessage,
                    enableVoice: enableVoiceToggle.checked
                })
            });
            
            // Remove typing indicator
            chatMessages.removeChild(typingIndicator);
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const data = await response.json();
            
            // Add AI response to chat
            addMessage('ai', data.message);
            
            // Play audio if available and voice is enabled
            if (data.audio_url && enableVoiceToggle.checked) {
                audioPlayer.src = data.audio_url;
                audioPlayer.play();
            }
        } catch (error) {
            console.error('Error:', error);
            addMessage('system', 'There was an error processing your message. Please try again.');
        } finally {
            // Reset processing state
            isProcessing = false;
            sendButton.disabled = false;
            userInput.focus();
        }
    }
    
    // Function to initiate call with audio
    async function initiateCall() {
        try {
            initiateCallButton.disabled = true;
            
            const response = await fetch('/api/initiate_call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    scenario_id: scenarioId
                })
            });
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const data = await response.json();
            
            // Start conversation
            startConversation();
            
            // Play the audio if voice is enabled
            if (enableVoiceToggle.checked && data.audio_url) {
                audioPlayer.src = data.audio_url;
                audioPlayer.play();
            }
        } catch (error) {
            console.error('Error initiating call:', error);
            addMessage('system', 'Failed to initiate call. Please try again.');
            initiateCallButton.disabled = false;
        }
    }
    
    // Function to play text as speech
    function playAudioMessage(text) {
        // This is a simplified version - in a real app, you'd generate audio on the server
        // For demo purposes, using browser's speech synthesis
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            speechSynthesis.speak(utterance);
        }
    }
    
    // Function to end scenario and show feedback
    async function endScenario() {
        try {
            const response = await fetch('/api/end_scenario', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const data = await response.json();
            
            // Display feedback in modal
            displayFeedback(data);
            feedbackModal.style.display = 'flex';
            
            // Log attempt for analytics
            logAttempt(data);
        } catch (error) {
            console.error('Error ending scenario:', error);
            alert('There was an error processing your results. Please try again.');
        }
    }
    
    // Function to report as scam (shortcut to end with good feedback)
    function reportScam() {
        addMessage('user', 'I believe this is a scam attempt. I\'m going to end this conversation and report it to the proper authorities.');
        setTimeout(endScenario, 1000);  // Short delay for UX
    }
    
    // Function to display feedback in modal
    function displayFeedback(data) {
        // Set success level with appropriate styling
        const successLevel = document.getElementById('success-level');
        successLevel.textContent = data.success_level;
        successLevel.className = 'success-indicator ' + data.success_level.toLowerCase().replace(' ', '-');
        
        // Set overall feedback
        document.getElementById('overall-feedback').textContent = data.overall_feedback;
        
        // Populate red flags list
        const redFlagsList = document.getElementById('red-flags-list');
        redFlagsList.innerHTML = '';
        data.red_flags_missed.forEach(flag => {
            const li = document.createElement('li');
            li.textContent = flag;
            redFlagsList.appendChild(li);
        });
        
        // Populate revealed info list
        const revealedInfoList = document.getElementById('revealed-info-list');
        revealedInfoList.innerHTML = '';
        if (data.information_revealed && data.information_revealed.length > 0) {
            data.information_revealed.forEach(info => {
                const li = document.createElement('li');
                li.textContent = info;
                revealedInfoList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'No sensitive information revealed. Good job!';
            revealedInfoList.appendChild(li);
        }
        
        // Populate attacker goals list
        const attackerGoalsList = document.getElementById('attacker-goals-list');
        attackerGoalsList.innerHTML = '';
        data.what_attacker_wanted.forEach(goal => {
            const li = document.createElement('li');
            li.textContent = goal;
            attackerGoalsList.appendChild(li);
        });
        
        // Generate learning points based on performance
        const learningPointsList = document.getElementById('learning-points');
        learningPointsList.innerHTML = '';
        
        // Add standard learning points
        const learningPoints = [
            'Always verify the identity of anyone requesting sensitive information',
            'Take time to think - urgency is a red flag in most situations',
            'When in doubt, hang up and call back using an official number',
            "Remember that legitimate organizations won't ask for passwords or full account details"
        ];
        
        // Add specific learning points based on scenario
        if (data.success_level === 'Needs Improvement') {
            learningPoints.push('Practice being assertive when refusing suspicious requests');
            learningPoints.push('Remember that it\'s okay to say "no" to requests that make you uncomfortable');
        }
        
        learningPoints.forEach(point => {
            const li = document.createElement('li');
            li.textContent = point;
            learningPointsList.appendChild(li);
        });
    }
    
    // Function to log attempt for analytics
    async function logAttempt(data) {
        try {
            await fetch('/api/log_attempt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    scenario_id: scenarioId,
                    success_level: data.success_level,
                    duration_seconds: data.duration_seconds,
                    information_revealed: data.information_revealed.length
                })
            });
        } catch (error) {
            console.error('Error logging attempt:', error);
        }
    }
    
    // Event Listeners
    sendButton.addEventListener('click', handleUserMessage);
    
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleUserMessage();
        }
    });
    
    endScenarioButton.addEventListener('click', endScenario);
    reportScamButton.addEventListener('click', reportScam);
    initiateCallButton.addEventListener('click', initiateCall);
    
    closeModal.addEventListener('click', function() {
        feedbackModal.style.display = 'none';
    });
    
    retryScenarioButton.addEventListener('click', function() {
        location.reload();
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === feedbackModal) {
            feedbackModal.style.display = 'none';
        }
    });
    
    // Start conversation automatically after a short delay
    setTimeout(startConversation, 2000);
});
