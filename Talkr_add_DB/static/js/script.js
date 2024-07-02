document.addEventListener("DOMContentLoaded", function () {
  const chatContainer = document.getElementById("chat-container");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const voiceBtn = document.getElementById("voice-btn");
  const autoMicToggle = document.getElementById("auto-mic-toggle");
  const authModal = document.getElementById("auth-modal");
  const loginBtn = document.getElementById("login-btn");
  const signupBtn = document.getElementById("signup-btn");
  const authMessage = document.getElementById("auth-message");
  const userStatus = document.getElementById("user-status");
  const modalTitle = document.getElementById("modal-title");
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const showSignupLink = document.getElementById("show-signup");
  const showLoginLink = document.getElementById("show-login");
  const menuIcon = document.getElementById("menu-icon");
  const historyModal = document.getElementById("history-modal");
  const closeHistoryModal = document.querySelector("#history-modal .close");
  const historyContainer = document.getElementById("history-container");
  const loadMoreHistoryBtn = document.getElementById("load-more-history");

  let recognition;
  let isMicrophoneActive = false;
  let isAITalking = false;
  let isLoading = false;
  let isListening = false;
  let isProcessing = false;
  let isAutoMicOn = false;
  let currentAudio = null;
  let silenceTimer;
  let hasSpeechStarted = false;
  let sessionStartTime;
  let isLoggedIn = false;
  const silenceThreshold = 1500;
  let lastProcessedResult = "";
  let isTranslating = false;
  let historyPage = 1;

  function setupSpeechRecognition() {
    if ("webkitSpeechRecognition" in window) {
      recognition = new webkitSpeechRecognition();
    } else if ("SpeechRecognition" in window) {
      recognition = new SpeechRecognition();
    } else {
      console.error("음성 인식이 지원되지 않는 브라우저입니다.");
      return;
    }

    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = function () {
      console.log("음성 인식이 시작되었습니다.");
      isListening = true;
      voiceBtn.classList.add("active");
      voiceBtn.classList.add("voice-active");
    };

    recognition.onspeechstart = function () {
      console.log("음성이 감지되었습니다.");
      hasSpeechStarted = true;
      clearTimeout(silenceTimer);
    };

    recognition.onresult = function (event) {
      clearTimeout(silenceTimer);

      let currentTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          currentTranscript += event.results[i][0].transcript + " ";
        }
      }

      if (currentTranscript.trim() !== lastProcessedResult.trim()) {
        userInput.value = currentTranscript.trim();

        if (currentTranscript.trim() !== "") {
          lastProcessedResult = currentTranscript.trim();
          sendMessage(lastProcessedResult);
        }
      }

      startSilenceTimer();
    };

    recognition.onspeechend = function () {
      console.log("음성 입력이 중지되었습니다.");
      startSilenceTimer();
    };

    recognition.onend = function () {
      console.log("음성 인식이 종료되었습니다.");
      isListening = false;
      hasSpeechStarted = false;
      voiceBtn.classList.remove("active");
      voiceBtn.classList.remove("voice-active");

      if (
        userInput.value.trim() !== "" &&
        userInput.value.trim() !== lastProcessedResult
      ) {
        lastProcessedResult = userInput.value.trim();
        sendMessage(lastProcessedResult);
      }

      if (isAutoMicOn && !isAITalking && !isLoading) {
        startListening();
      }
    };

    recognition.onerror = function (event) {
      console.error("음성 인식 오류", event.error);
      stopListening();
      if (isAutoMicOn) {
        setTimeout(startListening, 1000);
      }
    };
  }

  function startSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (isListening) {
        console.log("침묵이 감지되어 음성 인식을 중지합니다.");
        stopListening();
      }
    }, silenceThreshold);
  }

  function startListening() {
    if (!recognition) {
      setupSpeechRecognition();
    }

    recognition.start();
    isMicrophoneActive = true;
    voiceBtn.classList.add("active");
    console.log("음성 인식이 시작되었습니다.");
  }

  function stopListening() {
    if (recognition) {
      recognition.stop();
      isMicrophoneActive = false;
      voiceBtn.classList.remove("active");
      console.log("음성 인식이 중지되었습니다.");
    }
  }

  function addLoadingAnimation() {
    isLoading = true;
    if (isAutoMicOn) {
      stopListening();
    }
    const messageDiv = document.createElement("div");
    messageDiv.className = "message bot-message";

    const loadingDiv = document.createElement("div");
    loadingDiv.className = "message-bubble loading";
    loadingDiv.innerHTML = `
          <div class="loading-dots">
              <span></span>
              <span></span>
              <span></span>
          </div>
      `;
    messageDiv.appendChild(loadingDiv);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return messageDiv;
  }

  function removeLoadingAnimation(loadingDiv) {
    chatContainer.removeChild(loadingDiv);
    isLoading = false;
    if (isAutoMicOn && !isAITalking) {
      startListening();
    }
  }

  function addMessage(message, isUser, audioData) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${isUser ? "user-message" : "bot-message"}`;

    const messageBubble = document.createElement("div");
    messageBubble.className = "message-bubble";
    messageBubble.textContent = message;
    messageDiv.appendChild(messageBubble);

    if (!isUser) {
      const translateBtn = document.createElement("button");
      translateBtn.className = "translate-btn";
      translateBtn.textContent = "Translate";
      translateBtn.onclick = function () {
        if (!isTranslating) {
          this.classList.toggle("active");
          translateMessage(message, messageDiv, this);
        } else {
          console.log("번역이 이미 진행 중입니다.");
        }
      };
      messageDiv.appendChild(translateBtn);
    }

    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    if (!isUser && audioData) {
      playAudio(audioData);
    }
  }

  function sendMessage(message) {
    if (message && message.trim() !== "") {
      addMessage(message, true);
      userInput.value = "";
      lastProcessedResult = "";

      const loadingDiv = addLoadingAnimation();
      isLoading = true;
      isAITalking = true;
      stopListening();

      fetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: message }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          removeLoadingAnimation(loadingDiv);
          isLoading = false;
          if (data.success) {
            addMessage(data.message, false, data.audio);
          } else {
            throw new Error("서버에서 오류 응답을 받았습니다.");
          }
        })
        .catch((error) => {
          removeLoadingAnimation(loadingDiv);
          isLoading = false;
          isAITalking = false;
          console.error("Error:", error);
          addMessage(
            "네트워크 오류가 발생했습니다. 다시 시도해 주세요.",
            false
          );
          if (isAutoMicOn) {
            startListening();
          }
        });
    }
  }

  function playAudio(audioData) {
    isAITalking = true;
    currentAudio = new Audio("data:audio/mp3;base64," + audioData);
    currentAudio.play().catch((error) => {
      console.error("오디오 재생 오류:", error);
      isAITalking = false;
      if (isAutoMicOn) {
        startListening();
      }
    });
    currentAudio.onended = function () {
      currentAudio = null;
      isAITalking = false;
      if (isAutoMicOn) {
        startListening();
      }
    };
  }

  function login() {
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    fetch("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: username, password: password }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          isLoggedIn = true;
          authModal.style.display = "none";
          userStatus.textContent = `User: ${username}`;
          sessionStartTime = new Date();
          startUsageTracking();
        } else {
          authMessage.textContent = "Failed to log in. Please try again.";
        }
      })
      .catch((error) => {
        console.error("Login error:", error);
        authMessage.textContent =
          "An error occurred while logging in. Please try again.";
      });
  }

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  function signup() {
    const username = document.getElementById("signup-username").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;

    if (!username || !email || !password) {
      authMessage.textContent = "Please fill in all fields.";
      return;
    }

    if (!email) {
      authMessage.textContent =
        "Buddy, don't tell me you don't have an email? It's the 21st century.";
      return;
    }

    if (!isValidEmail(email)) {
      authMessage.textContent =
        "The email format is wrong. Hey friend, don't you know email formats in the 21st century?";
      return;
    }

    if (password.length < 4) {
      authMessage.textContent = `What? Seriously? A ${password.length}-character password? Please make it longer. (At least 4 characters)`;
      return;
    }

    fetch("/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username,
        email: email,
        password: password,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          authMessage.textContent = "Sign up successful. Please log in.";
          showLoginLink.click();
        } else if (data.error === "username_taken") {
          authMessage.textContent = `Okay, ${username} is good name, but someone's already using it. Life is first come, first served.`;
        } else {
          authMessage.textContent = "Sign up failed. Please try again.";
        }
      })
      .catch((error) => {
        console.error("Signup error:", error);
        authMessage.textContent =
          "An error occurred during sign up. Please try again.";
      });
  }

  function startUsageTracking() {
    setInterval(() => {
      const currentTime = new Date();
      const usageTime = Math.floor((currentTime - sessionStartTime) / 1000);
      updateUsageTime(usageTime);
    }, 60000);
  }

  function updateUsageTime(time) {
    fetch("/update_usage_time", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ time: time }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) {
          console.error("사용 시간 업데이트 실패");
        }
      })
      .catch((error) => {
        console.error("Usage time update error:", error);
      });
  }

  function stopAITalking() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    isAITalking = false;
    isLoading = false;
    console.log("AI 발화가 중지되었습니다.");
  }

  function translateMessage(message, messageDiv, translateBtn) {
    if (isTranslating) {
      console.log("번역이 이미 진행 중입니다.");
      return;
    }

    const existingTranslation = messageDiv.querySelector(".translation");
    if (existingTranslation) {
      existingTranslation.style.display =
        existingTranslation.style.display === "none" ? "block" : "none";
      return;
    }

    isTranslating = true;
    translateBtn.disabled = true;

    const loadingDiv = addTranslationLoadingAnimation(messageDiv);

    fetch("/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: message }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.translation) {
          const translationDiv = document.createElement("div");
          translationDiv.className = "translation";
          translationDiv.textContent = data.translation;
          messageDiv.appendChild(translationDiv);
          translationDiv.style.display = "block";
          chatContainer.scrollTop = chatContainer.scrollHeight;
        } else {
          throw new Error("번역 데이터가 없습니다.");
        }
      })
      .catch((error) => {
        console.error("Translation error:", error);
        addMessage("번역 중 오류가 발생했습니다. 다시 시도해 주세요.", false);
        translateBtn.classList.remove("active");
      })
      .finally(() => {
        removeTranslationLoadingAnimation(loadingDiv);
        isTranslating = false;
        translateBtn.disabled = false;
      });
  }

  function addTranslationLoadingAnimation(container) {
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "loading-animation";
    loadingDiv.innerHTML = `
      <div class="loading-spinner translate">
        <div class="spinner-circle"></div>
        <div class="spinner-circle-inner"></div>
      </div>
    `;
    container.appendChild(loadingDiv);
    return loadingDiv;
  }

  function removeTranslationLoadingAnimation(loadingDiv) {
    if (loadingDiv && loadingDiv.parentNode) {
      loadingDiv.parentNode.removeChild(loadingDiv);
    }
  }

  function loadHistory() {
    fetch(`/get_history?page=${historyPage}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        let currentDate = null;
        data.history.forEach((conv) => {
          if (conv.date !== currentDate) {
            currentDate = conv.date;
            const dateElement = document.createElement("h3");
            dateElement.textContent = currentDate;
            historyContainer.appendChild(dateElement);
          }

          const convElement = document.createElement("div");
          convElement.className = "history-conversation";

          conv.messages.forEach((msg) => {
            const msgElement = document.createElement("div");
            msgElement.className = `message ${
              msg.is_user ? "user-message" : "bot-message"
            }`;
            msgElement.innerHTML = `
            <div class="message-bubble">
              ${msg.content}
            </div>
            <div class="message-time">${msg.timestamp}</div>
          `;
            convElement.appendChild(msgElement);
          });

          historyContainer.appendChild(convElement);
        });

        if (!data.has_next) {
          loadMoreHistoryBtn.style.display = "none";
        } else {
          loadMoreHistoryBtn.style.display = "block";
        }
        historyPage++;
      })
      .catch((error) => console.error("Error loading history:", error));
  }

  sendBtn.addEventListener("click", () => sendMessage(userInput.value.trim()));

  userInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      sendMessage(userInput.value.trim());
    }
  });
  showSignupLink.addEventListener("click", function (e) {
    e.preventDefault();
    modalTitle.textContent = "Sign Up";
    loginForm.style.display = "none";
    signupForm.style.display = "block";
  });

  showLoginLink.addEventListener("click", function (e) {
    e.preventDefault();
    modalTitle.textContent = "Login";
    signupForm.style.display = "none";
    loginForm.style.display = "block";
  });

  voiceBtn.addEventListener("click", function () {
    if (isAITalking || isLoading) {
      stopAITalking();
      return;
    }
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  });

  autoMicToggle.addEventListener("click", function () {
    isAutoMicOn = !isAutoMicOn;
    autoMicToggle.textContent = isAutoMicOn ? "Auto Mic: ON" : "Auto Mic: OFF";
    autoMicToggle.classList.toggle("active");
    if (isAutoMicOn && !isAITalking && !isLoading) {
      startListening();
    } else if (!isAutoMicOn) {
      stopListening();
    }
  });

  loginBtn.addEventListener("click", login);
  signupBtn.addEventListener("click", signup);

  menuIcon.addEventListener("click", function () {
    historyModal.style.display = "block";
    loadHistory();
  });

  closeHistoryModal.addEventListener("click", function () {
    historyModal.style.display = "none";
    historyContainer.innerHTML = ""; // 모달을 닫을 때 내용을 비웁니다
    historyPage = 1; // 페이지 번호를 리셋합니다
  });

  loadMoreHistoryBtn.addEventListener("click", loadHistory);

  setupSpeechRecognition();
  // authModal.style.display = "block"; 위에 추가
  modalTitle.textContent = "Login";
  loginForm.style.display = "block";
  signupForm.style.display = "none";
  authModal.style.display = "block";
});
