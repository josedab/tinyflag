// Package controller implements the TinyFlag Kubernetes operator controller.
//
// The controller watches FlagConfig custom resources and syncs flag files
// from Git repositories into Kubernetes ConfigMaps.
package controller

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// FlagConfigSpec defines the desired state of a FlagConfig resource.
type FlagConfigSpec struct {
	Source     SourceSpec     `json:"source"`
	ConfigMap ConfigMapSpec  `json:"configMap"`
	Namespaces []string      `json:"namespaces,omitempty"`
	Sidecar   *SidecarSpec  `json:"sidecar,omitempty"`
}

// SourceSpec defines the Git source for flag files.
type SourceSpec struct {
	GitRepo      string `json:"gitRepo"`
	Branch       string `json:"branch"`
	Path         string `json:"path"`
	PollInterval string `json:"pollInterval"`
}

// ConfigMapSpec defines the target ConfigMap.
type ConfigMapSpec struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	Key       string `json:"key"`
}

// SidecarSpec defines sidecar injection configuration.
type SidecarSpec struct {
	Enabled bool `json:"enabled"`
	Port    int  `json:"port"`
}

// FlagConfigStatus defines the observed state of a FlagConfig resource.
type FlagConfigStatus struct {
	Phase        string `json:"phase"`
	LastSyncTime string `json:"lastSyncTime,omitempty"`
	LastCommit   string `json:"lastCommit,omitempty"`
	Message      string `json:"message,omitempty"`
	ConfigMapRef string `json:"configMapRef,omitempty"`
}

// Controller manages FlagConfig resources.
type Controller struct {
	clientset *kubernetes.Clientset
	namespace string
	stopCh    chan struct{}
}

// NewController creates a new FlagConfig controller.
func NewController(clientset *kubernetes.Clientset, namespace string) *Controller {
	return &Controller{
		clientset: clientset,
		namespace: namespace,
		stopCh:    make(chan struct{}),
	}
}

// SyncFlags pulls the latest flag file from Git and updates the ConfigMap.
func (c *Controller) SyncFlags(ctx context.Context, spec FlagConfigSpec) (*FlagConfigStatus, error) {
	status := &FlagConfigStatus{Phase: "Syncing"}

	// Clone or pull the Git repo
	content, commit, err := fetchFlagFile(spec.Source)
	if err != nil {
		status.Phase = "Error"
		status.Message = fmt.Sprintf("Git fetch failed: %v", err)
		return status, err
	}

	// Determine target namespace
	targetNs := spec.ConfigMap.Namespace
	if targetNs == "" {
		targetNs = c.namespace
	}

	// Create or update ConfigMap
	configMapName := spec.ConfigMap.Name
	if configMapName == "" {
		configMapName = "tinyflag-flags"
	}

	key := spec.ConfigMap.Key
	if key == "" {
		key = "flags.yml"
	}

	namespaces := append([]string{targetNs}, spec.Namespaces...)

	for _, ns := range namespaces {
		if err := c.upsertConfigMap(ctx, ns, configMapName, key, content); err != nil {
			status.Phase = "Error"
			status.Message = fmt.Sprintf("ConfigMap update failed in %s: %v", ns, err)
			return status, err
		}
	}

	status.Phase = "Synced"
	status.LastSyncTime = time.Now().UTC().Format(time.RFC3339)
	status.LastCommit = commit
	status.ConfigMapRef = fmt.Sprintf("%s/%s", targetNs, configMapName)
	status.Message = fmt.Sprintf("Synced %d namespace(s)", len(namespaces))

	return status, nil
}

// upsertConfigMap creates or updates a ConfigMap in the given namespace.
func (c *Controller) upsertConfigMap(ctx context.Context, namespace, name, key, content string) error {
	configMaps := c.clientset.CoreV1().ConfigMaps(namespace)

	existing, err := configMaps.Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		// Create new ConfigMap
		cm := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{
				Name:      name,
				Namespace: namespace,
				Labels: map[string]string{
					"app.kubernetes.io/managed-by": "tinyflag-operator",
					"tinyflag.io/type":             "flags",
				},
			},
			Data: map[string]string{
				key: content,
			},
		}
		_, err = configMaps.Create(ctx, cm, metav1.CreateOptions{})
		return err
	}

	// Update existing ConfigMap
	if existing.Data == nil {
		existing.Data = make(map[string]string)
	}
	existing.Data[key] = content
	_, err = configMaps.Update(ctx, existing, metav1.UpdateOptions{})
	return err
}

// fetchFlagFile clones a git repo and reads the flag file.
func fetchFlagFile(source SourceSpec) (string, string, error) {
	branch := source.Branch
	if branch == "" {
		branch = "main"
	}

	// Use git archive to fetch a single file without cloning entire repo
	cmd := exec.Command("git", "archive",
		"--remote="+source.GitRepo,
		branch,
		source.Path,
	)

	output, err := cmd.Output()
	if err != nil {
		// Fallback: try shallow clone
		return fetchViaClone(source)
	}

	// Get latest commit hash
	commitCmd := exec.Command("git", "ls-remote", source.GitRepo, branch)
	commitOutput, err := commitCmd.Output()
	if err != nil {
		return string(output), "unknown", nil
	}

	parts := strings.Fields(string(commitOutput))
	commit := "unknown"
	if len(parts) > 0 {
		commit = parts[0][:8]
	}

	return string(output), commit, nil
}

func fetchViaClone(source SourceSpec) (string, string, error) {
	tmpDir := fmt.Sprintf("/tmp/tinyflag-sync-%d", time.Now().UnixNano())

	cmd := exec.Command("git", "clone",
		"--depth=1",
		"--branch="+source.Branch,
		"--single-branch",
		source.GitRepo,
		tmpDir,
	)

	if err := cmd.Run(); err != nil {
		return "", "", fmt.Errorf("git clone failed: %w", err)
	}

	// Read flag file
	flagPath := fmt.Sprintf("%s/%s", tmpDir, source.Path)
	content, err := exec.Command("cat", flagPath).Output()
	if err != nil {
		return "", "", fmt.Errorf("flag file not found: %s", source.Path)
	}

	// Get commit hash
	commitOutput, _ := exec.Command("git", "-C", tmpDir, "rev-parse", "--short", "HEAD").Output()
	commit := strings.TrimSpace(string(commitOutput))

	// Cleanup
	exec.Command("rm", "-rf", tmpDir).Run()

	log.Printf("Synced flags from %s@%s (%s)", source.GitRepo, source.Branch, commit)

	return string(content), commit, nil
}

// Stop signals the controller to stop.
func (c *Controller) Stop() {
	close(c.stopCh)
}
