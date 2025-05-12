// Package main is the TinyFlag sidecar — a lightweight HTTP server
// that exposes flag configuration from a ConfigMap volume mount.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

var (
	flagContent     []byte
	flagContentLock sync.RWMutex
	flagsFile       string
)

func main() {
	port := os.Getenv("TINYFLAG_PORT")
	if port == "" {
		port = "8080"
	}

	flagsFile = os.Getenv("TINYFLAG_FLAGS_FILE")
	if flagsFile == "" {
		flagsFile = "/etc/tinyflag/flags.yml"
	}

	// Initial load
	loadFlags()

	// Watch for changes
	go watchFlags()

	mux := http.NewServeMux()
	mux.HandleFunc("/flags", handleFlags)
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/ready", handleReady)

	addr := fmt.Sprintf(":%s", port)
	log.Printf("TinyFlag sidecar listening on %s (flags: %s)", addr, flagsFile)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func loadFlags() {
	content, err := os.ReadFile(flagsFile)
	if err != nil {
		log.Printf("Warning: could not read flags file: %v", err)
		return
	}

	flagContentLock.Lock()
	flagContent = content
	flagContentLock.Unlock()

	log.Printf("Loaded flags (%d bytes)", len(content))
}

func watchFlags() {
	var lastMod time.Time
	for {
		time.Sleep(5 * time.Second)

		info, err := os.Stat(flagsFile)
		if err != nil {
			continue
		}

		if info.ModTime().After(lastMod) {
			lastMod = info.ModTime()
			loadFlags()
		}
	}
}

func handleFlags(w http.ResponseWriter, r *http.Request) {
	flagContentLock.RLock()
	content := flagContent
	flagContentLock.RUnlock()

	if content == nil {
		http.Error(w, "flags not loaded", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/x-yaml")
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(content)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleReady(w http.ResponseWriter, r *http.Request) {
	flagContentLock.RLock()
	ready := flagContent != nil
	flagContentLock.RUnlock()

	if !ready {
		http.Error(w, "not ready", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
}
