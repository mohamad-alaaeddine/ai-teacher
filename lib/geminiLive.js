/**
 * Verwaltet die WebSocket-Verbindung zur Gemini Live API.
 * Mit vollständigem Logging + automatischem Reconnect bei goAway / Fehlercode 1008.
 */
export function createGeminiLiveSession(opts) {
  const { apiKey } = opts;
  let systemText = opts.systemText; // ← mutable für Reconnect-Updates
  let ws;
  let onMessage = () => {};
  let onReconnect = () => {};
  let messageCounter = 0;
  let audioChunkCounter = 0;

  // Reconnect-Status
  let isReconnecting = false;
  let reconnectTimer = null;
  let shouldReconnect = true; // false nur wenn User selbst disconnect macht

  // ── LOG-FUNKTION ──
  // Speichert alle Events in gemini_logs.txt UND gibt sie auf der Konsole aus
  async function saveLog(logData) {
    try {
      await fetch("/api/debug-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logData),
      });
    } catch (e) {
      console.error("❌ [SAVE LOG] Failed to save log:", e);
    }
  }

  // ── RECONNECT-FUNKTION ──
  function reconnect(delayMs = 1000) {
    try {
      if (isReconnecting) {
        console.log("⚠️ [RECONNECT] Already reconnecting, skipping...");
        saveLog({ event: "RECONNECT_SKIP", reason: "Already reconnecting" });
        return;
      }

      isReconnecting = true;
      console.log(`🔄 [RECONNECT] Scheduled in ${delayMs}ms...`);
      saveLog({ event: "RECONNECT_SCHEDULED", delayMs });

      // UI benachrichtigen
      try {
        onReconnect();
      } catch (callbackError) {
        console.error("❌ [RECONNECT] Callback error:", callbackError);
        saveLog({ event: "RECONNECT_CALLBACK_ERROR", error: callbackError.message, stack: callbackError.stack });
      }

      reconnectTimer = setTimeout(() => {
        try {
          isReconnecting = false;
          messageCounter = 0;
          audioChunkCounter = 0;
          console.log("🔄 [RECONNECT] Starting new connection now...");
          saveLog({ event: "RECONNECT_EXECUTING" });
          connect();
        } catch (reconnectError) {
          console.error("❌ [RECONNECT] Execution error:", reconnectError);
          saveLog({ event: "RECONNECT_EXECUTION_ERROR", error: reconnectError.message, stack: reconnectError.stack });
        }
      }, delayMs);
      
    } catch (e) {
      console.error("❌ [RECONNECT] Function error:", e);
      saveLog({ event: "RECONNECT_FUNCTION_ERROR", error: e.message, stack: e.stack });
    }
  }

  // ── CONNECT ──
  function connect() {
    console.log("🔄 [CONNECT] Starting WebSocket connection...");
    saveLog({ event: "CONNECT", message: "Starting WebSocket connection" });

    try {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      ws = new WebSocket(url);

      // ── ON OPEN ──
      ws.onopen = () => {
        try {
          console.log("✅ [OPEN] WebSocket connection established");
          console.log("📊 [OPEN] WebSocket readyState:", ws.readyState);
          saveLog({ event: "OPEN", state: ws.readyState });

          try {
            const setup = {
              setup: {
                // model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
                model: "models/gemini-3.1-flash-live-preview",
                generationConfig: {
                  responseModalities: ["AUDIO"],
                  // thinkingConfig: {
                  //   thinkingBudget: 0
                  // },
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: "Aoede" }
                    }
                  }
                },
                outputAudioTranscription: {},
                systemInstruction: {
                  parts: [{ text: systemText }],
                },
              },
            };

            console.log("📤 [SETUP] Sending configuration:", JSON.stringify(setup, null, 2));
            saveLog({ event: "SETUP", config: setup });
            ws.send(JSON.stringify(setup));
            console.log("✅ [SETUP] Configuration sent successfully");

          } catch (setupError) {
            console.error("❌ [SETUP ERROR] Failed to send setup:", setupError);
            saveLog({ event: "SETUP_ERROR", error: setupError.message, stack: setupError.stack });
          }
          
        } catch (openError) {
          console.error("❌ [OPEN HANDLER ERROR]", openError);
          saveLog({ event: "OPEN_HANDLER_ERROR", error: openError.message, stack: openError.stack });
        }
      };

      // ── ON MESSAGE ──
      ws.onmessage = async (ev) => {
        messageCounter++;
        // console.log(`📥 [MESSAGE #${messageCounter}] Received, type:`, ev.data instanceof Blob ? "Blob" : "String");

        try {
          // BLOB (Audio oder verstecktes JSON)
          if (ev.data instanceof Blob) {
            ev.data.size > 200 && console.log(`🎵 [AUDIO BLOB #${messageCounter}] Size: ${ev.data.size} bytes`);
            //saveLog({ event: "AUDIO_BLOB", messageNumber: messageCounter, size: ev.data.size });

            try {
              const buffer = await ev.data.arrayBuffer();
              buffer.byteLength > 200 && console.log(`✅ [AUDIO BUFFER #${messageCounter}] Converted, size: ${buffer.byteLength} bytes`);

              // Prüfen ob JSON im Blob versteckt ist
              try {
                const text = new TextDecoder().decode(buffer);
                if (text.startsWith('{')) {
                  const parsed = JSON.parse(text);
                  !parsed.sessionResumptionUpdate && console.log(`🔍 [HIDDEN JSON IN BLOB #${messageCounter}]`, JSON.stringify(parsed, null, 2));
                  !parsed.sessionResumptionUpdate && saveLog({ event: "HIDDEN_JSON_IN_BLOB", messageNumber: messageCounter, data: parsed });

                  // goAway im Blob abfangen
                  if (parsed.goAway) {
                    const timeLeft = parsed.goAway.timeLeft || "0s";
                    const seconds = parseInt(timeLeft) || 10;
                    console.warn(`⚠️ [GO AWAY IN BLOB #${messageCounter}] Session ending in ${timeLeft}`);
                    saveLog({ event: "GO_AWAY_IN_BLOB", timeLeft, messageNumber: messageCounter });
                    if (shouldReconnect) reconnect(Math.max((seconds - 5) * 1000, 1000));
                    return;
                  }

                  if (parsed.error) {
                    console.error(`❌ [GEMINI ERROR IN BLOB #${messageCounter}]`, parsed.error);
                    saveLog({ event: "GEMINI_ERROR_IN_BLOB", messageNumber: messageCounter, error: parsed.error });
                  }
                }
              } catch (jsonParseError) {
                // Kein JSON → normales Audio, weiter
                // console.log(`📝 [BLOB] No JSON detected, treating as pure audio`);
              }

              try {
                onMessage(buffer);
              } catch (messageCallbackError) {
                console.error(`❌ [MESSAGE CALLBACK ERROR #${messageCounter}]`, messageCallbackError);
                saveLog({ event: "MESSAGE_CALLBACK_ERROR", messageNumber: messageCounter, error: messageCallbackError.message, stack: messageCallbackError.stack });
              }

            } catch (blobError) {
              console.error(`❌ [BLOB CONVERSION ERROR #${messageCounter}]`, blobError);
              saveLog({ event: "BLOB_ERROR", messageNumber: messageCounter, error: blobError.message, stack: blobError.stack });
            }

          } else {
            // STRING → JSON
            // console.log(`📝 [JSON STRING #${messageCounter}] Raw (first 500):`, ev.data.substring(0, 500));

            try {
              const msg = JSON.parse(ev.data);
              !msg.sessionResumptionUpdate && console.log(`✅ [PARSED JSON #${messageCounter}]`, JSON.stringify(msg, null, 2));
              !msg.sessionResumptionUpdate && saveLog({ event: "PARSED_JSON", messageNumber: messageCounter, data: msg });

              // Struktur analysieren
              // console.log(`🔍 [STRUCTURE #${messageCounter}]`, {
              //   hasSetupComplete: !!msg.setupComplete,
              //   hasServerContent: !!msg.serverContent,
              //   hasGoAway: !!msg.goAway,
              //   hasError: !!msg.error,
              //   hasUsageMetadata: !!msg.usageMetadata,
              //   keys: Object.keys(msg)
              // });

              // ── goAway: Session läuft ab ──
              if (msg.goAway) {
                try {
                  const timeLeft = msg.goAway.timeLeft || "0s";
                  const seconds = parseInt(timeLeft) || 10;
                  console.warn(`⚠️ [GO AWAY #${messageCounter}] Session ending in ${timeLeft}. Reconnecting in ${Math.max(seconds - 5, 1)}s...`);
                  saveLog({ event: "GO_AWAY", timeLeft, seconds, reconnectIn: Math.max(seconds - 5, 1), messageNumber: messageCounter });
                  if (shouldReconnect) reconnect(Math.max((seconds - 5) * 1000, 1000));
                  return;
                } catch (goAwayError) {
                  console.error(`❌ [GO AWAY ERROR #${messageCounter}]`, goAwayError);
                  saveLog({ event: "GO_AWAY_ERROR", messageNumber: messageCounter, error: goAwayError.message, stack: goAwayError.stack });
                }
              }

              // serverContent analysieren
              if (msg.serverContent) {
                try {
                  const sc = msg.serverContent;
                  const serverContentInfo = {
                    hasTurnComplete: !!sc.turnComplete,
                    hasGenerationComplete: !!sc.generationComplete,
                    hasModelTurn: !!sc.modelTurn,
                    hasInputTranscription: !!sc.inputTranscription,
                    hasOutputTranscription: !!sc.outputTranscription,
                    allKeys: Object.keys(sc)
                  };
                  // console.log(`📊 [SERVER CONTENT #${messageCounter}]`, serverContentInfo);
                  saveLog({ event: "SERVER_CONTENT", messageNumber: messageCounter, info: serverContentInfo, fullContent: sc });

                  if (sc.inputTranscription) {
                    console.log(`🎤 [INPUT TRANS #${messageCounter}]`, sc.inputTranscription);
                    saveLog({ event: "INPUT_TRANSCRIPTION", messageNumber: messageCounter, data: sc.inputTranscription });
                  }

                  if (sc.outputTranscription) {
                    console.log(`👨‍🏫 [OUTPUT TRANS #${messageCounter}]`, sc.outputTranscription);
                    saveLog({ event: "OUTPUT_TRANSCRIPTION", messageNumber: messageCounter, data: sc.outputTranscription });
                  }

                  if (sc.modelTurn) {
                    const modelTurnInfo = {
                      partsCount: sc.modelTurn.parts?.length || 0,
                      partsTypes: sc.modelTurn.parts?.map(p =>
                        p.thought ? `thought(${p.text?.length || 0}chars)` :
                        p.text ? `text(${p.text.length}chars)` :
                        p.inlineData ? `audio(${p.inlineData.mimeType})` : "unknown"
                      )
                    };
                    // console.log(`🤖 [MODEL TURN #${messageCounter}]`, modelTurnInfo);
                    saveLog({ event: "MODEL_TURN", messageNumber: messageCounter, info: modelTurnInfo });
                  }

                  if (sc.turnComplete) {
                    console.log(`✅ [TURN COMPLETE #${messageCounter}]`);
                    saveLog({ event: "TURN_COMPLETE", messageNumber: messageCounter });
                  }
                  
                } catch (serverContentError) {
                  console.error(`❌ [SERVER CONTENT ERROR #${messageCounter}]`, serverContentError);
                  saveLog({ event: "SERVER_CONTENT_ERROR", messageNumber: messageCounter, error: serverContentError.message, stack: serverContentError.stack });
                }
              }

              // usageMetadata loggen
              if (msg.usageMetadata) {
                console.log(`📈 [USAGE #${messageCounter}]`, msg.usageMetadata);
                saveLog({ event: "USAGE_METADATA", messageNumber: messageCounter, data: msg.usageMetadata });
              }

              // Fehler loggen
              if (msg.error) {
                console.error(`❌❌❌ [GEMINI ERROR #${messageCounter}] ❌❌❌`, JSON.stringify(msg.error, null, 2));
                saveLog({ event: "GEMINI_ERROR", messageNumber: messageCounter, error: msg.error, fullMessage: msg });
              }

              try {
                onMessage(msg);
              } catch (messageCallbackError) {
                console.error(`❌ [MESSAGE CALLBACK ERROR #${messageCounter}]`, messageCallbackError);
                saveLog({ event: "MESSAGE_CALLBACK_ERROR", messageNumber: messageCounter, error: messageCallbackError.message, stack: messageCallbackError.stack });
              }

            } catch (parseError) {
              console.error(`❌ [PARSE ERROR #${messageCounter}]`, parseError);
              saveLog({ event: "PARSE_ERROR", messageNumber: messageCounter, error: parseError.message, rawData: ev.data.substring(0, 1000), stack: parseError.stack });
            }
          }

        } catch (messageError) {
          console.error(`❌ [MESSAGE HANDLER ERROR #${messageCounter}]`, messageError);
          saveLog({ event: "MESSAGE_HANDLER_ERROR", messageNumber: messageCounter, error: messageError.message, stack: messageError.stack });
        }
      };

      // ── ON ERROR ──
      ws.onerror = (e) => {
        try {
          console.error("❌ [WS ERROR] WebSocket error:", e);
          saveLog({ event: "WS_ERROR", type: e.type, state: ws?.readyState, timestamp: new Date().toISOString() });
        } catch (errorHandlerError) {
          console.error("❌ [WS ERROR HANDLER ERROR]", errorHandlerError);
        }
      };

      // ── ON CLOSE ──
      ws.onclose = (e) => {
        try {
          const closeReasons = {
            1000: "Normal closure",
            1001: "Going away",
            1002: "Protocol error",
            1003: "Unsupported data",
            1006: "Abnormal closure (no status code)",
            1007: "Invalid frame payload data",
            1008: "Policy violation / Model error",
            1009: "Message too big",
            1010: "Missing extension",
            1011: "Internal server error",
            1015: "TLS handshake failure"
          };

          const reasonText = closeReasons[e.code] || "Unknown";
          console.log("🔌 [CLOSE] WebSocket closed");
          console.log("📊 [CLOSE] Details:", {
            code: e.code,
            reason: e.reason || "(none)",
            reasonText,
            wasClean: e.wasClean,
            timestamp: new Date().toISOString(),
            totalMessagesReceived: messageCounter,
            totalAudioChunksSent: audioChunkCounter
          });

          saveLog({
            event: "CLOSE",
            code: e.code,
            reason: e.reason || "(none)",
            reasonText,
            wasClean: e.wasClean,
            totalMessages: messageCounter,
            totalAudioChunks: audioChunkCounter,
            timestamp: new Date().toISOString()
          });

          if (e.code === 1008) {
            console.error("⚠️ [CLOSE 1008] Policy violation – likely model config error or rate limit!");
            saveLog({ event: "CLOSE_1008_WARNING", message: "Model config error or rate limit detected" });
          }

          if (e.code === 1006) {
            console.error("⚠️ [CLOSE 1006] Abnormal closure – connection dropped unexpectedly!");
            saveLog({ event: "CLOSE_1006_WARNING", message: "Connection dropped unexpectedly" });
          }

          // Automatischer Reconnect bei unerwartetem Verbindungsabbruch
          if (shouldReconnect && e.code !== 1000) {
            try {
              const delay = e.code === 1008 ? 2000 : 1000;
              console.warn(`⚠️ [CLOSE] Unexpected close (${e.code}), reconnecting in ${delay}ms...`);
              saveLog({ event: "UNEXPECTED_CLOSE_RECONNECT", code: e.code, delay });
              reconnect(delay);
            } catch (reconnectTriggerError) {
              console.error("❌ [CLOSE] Reconnect trigger error:", reconnectTriggerError);
              saveLog({ event: "RECONNECT_TRIGGER_ERROR", error: reconnectTriggerError.message });
            }
          }
          
        } catch (closeHandlerError) {
          console.error("❌ [CLOSE HANDLER ERROR]", closeHandlerError);
          saveLog({ event: "CLOSE_HANDLER_ERROR", error: closeHandlerError.message, stack: closeHandlerError.stack });
        }
      };

      return ws;

    } catch (connectionError) {
      console.error("❌ [CONNECTION ERROR] Failed to create WebSocket:", connectionError);
      saveLog({ event: "CONNECTION_ERROR", error: connectionError.message, stack: connectionError.stack });
      throw connectionError;
    }
  }

  return {
    connect,

    disconnect: () => {
      try {
        console.log("🛑 [DISCONNECT] User initiated disconnect");
        saveLog({ event: "DISCONNECT", message: "User initiated disconnect", totalMessages: messageCounter });

        shouldReconnect = false;

        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
          console.log("✅ [DISCONNECT] Reconnect timer cleared");
        }

        try {
          if (ws) {
            console.log("📊 [DISCONNECT] Current WS state:", ws.readyState);
            ws.close(1000, "User disconnect");
            console.log("✅ [DISCONNECT] Close command sent");
          } else {
            console.log("⚠️ [DISCONNECT] WebSocket already null");
          }
        } catch (wsCloseError) {
          console.error("❌ [DISCONNECT] WS close error:", wsCloseError);
          saveLog({ event: "DISCONNECT_WS_CLOSE_ERROR", error: wsCloseError.message, stack: wsCloseError.stack });
        }
        
      } catch (disconnectError) {
        console.error("❌ [DISCONNECT ERROR]", disconnectError);
        saveLog({ event: "DISCONNECT_ERROR", error: disconnectError.message, stack: disconnectError.stack });
      }
    },

    sendText: (text) => {
      try {
        console.log("📤 [SEND TEXT] Attempting...");
        console.log("📊 [SEND TEXT] WS state:", ws?.readyState, "| Text:", text.substring(0, 100));

        try {
          if (!ws) {
            console.error("❌ [SEND TEXT] WebSocket is null!");
            saveLog({ event: "SEND_TEXT_ERROR", error: "WebSocket is null" });
            return;
          }
          if (ws.readyState !== 1) {
            console.error("❌ [SEND TEXT] WebSocket not ready! State:", ws.readyState);
            saveLog({ event: "SEND_TEXT_ERROR", error: "WebSocket not ready", state: ws.readyState });
            return;
          }

          const msg = {
            realtime_input: {
              text: text
            }
          };

          console.log("📝 [SEND TEXT] Full message:", JSON.stringify(msg, null, 2));
          saveLog({ event: "SEND_TEXT", text, fullMessage: msg });
          ws.send(JSON.stringify(msg));
          console.log("✅ [SEND TEXT] Sent successfully");

        } catch (sendError) {
          console.error("❌ [SEND TEXT ERROR]", sendError);
          saveLog({ event: "SEND_TEXT_ERROR", error: sendError.message, stack: sendError.stack, textLength: text.length });
        }
        
      } catch (outerError) {
        console.error("❌ [SEND TEXT OUTER ERROR]", outerError);
        saveLog({ event: "SEND_TEXT_OUTER_ERROR", error: outerError.message, stack: outerError.stack });
      }
    },

    sendAudio: (base64) => {
      try {
        audioChunkCounter++;

        // ── NEU: Stack trace loggen um Aufrufer zu identifizieren ──
        if (audioChunkCounter === 1) {
          const stack = new Error().stack;
          console.log("🔍 [SEND AUDIO FIRST CALL] Stack trace:", stack);
          saveLog({ event: "SEND_AUDIO_FIRST_CALL", stack, timestamp: new Date().toISOString() });
        }

/*        if (audioChunkCounter % 200 === 0) {
          console.log(`🎤 [SEND AUDIO] Chunk #${audioChunkCounter}, size: ${base64.length} chars`);
          saveLog({ event: "SEND_AUDIO_CHUNK", chunkNumber: audioChunkCounter, size: base64.length });
        }*/

        try {
          if (!ws || ws.readyState !== 1) {
            if (audioChunkCounter % 50 === 0) {
              console.error(`❌ [SEND AUDIO] WS not ready at chunk #${audioChunkCounter}, state: ${ws?.readyState}`);
              saveLog({ event: "SEND_AUDIO_ERROR", error: "WS not ready", chunkNumber: audioChunkCounter, state: ws?.readyState });
            }
            return;
          }

          ws.send(JSON.stringify({
            realtime_input: {
              audio: {
                mime_type: "audio/pcm;rate=16000",
                data: base64
              }
            }
          }));

        } catch (audioError) {
          console.error(`❌ [SEND AUDIO ERROR] Chunk #${audioChunkCounter}`, audioError);
          saveLog({ event: "SEND_AUDIO_ERROR", chunkNumber: audioChunkCounter, error: audioError.message, stack: audioError.stack });
        }
        
      } catch (outerError) {
        console.error("❌ [SEND AUDIO OUTER ERROR]", outerError);
        saveLog({ event: "SEND_AUDIO_OUTER_ERROR", error: outerError.message, stack: outerError.stack });
      }
    },

    sendImage: ({ base64, mimeType }) => {
      try {
        if (!ws || ws.readyState !== 1) {
          console.error("❌ [SEND IMAGE] WebSocket nicht bereit");
          return;
        }

        // ✅ بعت الصورة بس
        ws.send(JSON.stringify({
          realtime_input: {
            video: {
              mime_type: mimeType,
              data: base64,
            }
          }
        }));
        
        console.log("✅ [SEND IMAGE] Bild gesendet, Text kommt in 1s");
        
      } catch (e) {
        console.error("❌ [SEND IMAGE ERROR]", e);
      }
    },

    setOnMessage: (fn) => {
      try {
        console.log("📌 [CALLBACK] Message callback registered");
        saveLog({ event: "SET_ON_MESSAGE_CALLBACK" });
        onMessage = fn;
      } catch (e) {
        console.error("❌ [SET ON MESSAGE ERROR]", e);
        saveLog({ event: "SET_ON_MESSAGE_ERROR", error: e.message, stack: e.stack });
      }
    },

    setOnReconnect: (fn) => {
      try {
        console.log("📌 [CALLBACK] Reconnect callback registered");
        saveLog({ event: "SET_ON_RECONNECT_CALLBACK" });
        onReconnect = fn;
      } catch (e) {
        console.error("❌ [SET ON RECONNECT ERROR]", e);
        saveLog({ event: "SET_ON_RECONNECT_ERROR", error: e.message, stack: e.stack });
      }
    },

    // ── UPDATE SYSTEM TEXT (für Reconnect mit History) ──────
    updateSystem: (newSystemText) => {
      try {
        console.log("🔄 [UPDATE SYSTEM] System Text aktualisiert, Länge:", newSystemText.length);
        systemText = newSystemText;
        saveLog({ event: "SYSTEM_UPDATED", length: newSystemText.length });
      } catch (e) {
        console.error("❌ [UPDATE SYSTEM ERROR]", e);
      }
    },
  };
}