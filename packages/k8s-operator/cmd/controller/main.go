// Package main is the entrypoint for the TinyFlag Kubernetes operator.
package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

func main() {
	log.Println("Starting TinyFlag Kubernetes Operator")

	config, err := getKubeConfig()
	if err != nil {
		log.Fatalf("Failed to get Kubernetes config: %v", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Fatalf("Failed to create Kubernetes client: %v", err)
	}

	namespace := os.Getenv("WATCH_NAMESPACE")
	if namespace == "" {
		namespace = "default"
	}

	log.Printf("Watching namespace: %s", namespace)

	// Handle shutdown signals
	stopCh := make(chan os.Signal, 1)
	signal.Notify(stopCh, syscall.SIGTERM, syscall.SIGINT)

	_ = clientset // Controller will use this

	log.Println("TinyFlag Operator started. Watching for FlagConfig resources...")

	<-stopCh
	log.Println("Shutting down TinyFlag Operator")
}

func getKubeConfig() (*rest.Config, error) {
	// Try in-cluster config first
	config, err := rest.InClusterConfig()
	if err == nil {
		return config, nil
	}

	// Fall back to kubeconfig
	kubeconfig := os.Getenv("KUBECONFIG")
	if kubeconfig == "" {
		home, _ := os.UserHomeDir()
		kubeconfig = fmt.Sprintf("%s/.kube/config", home)
	}

	return clientcmd.BuildConfigFromFlags("", kubeconfig)
}
