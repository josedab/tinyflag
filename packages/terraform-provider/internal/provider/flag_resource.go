package provider

import (
	"context"
	"fmt"
	"os"

	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/booldefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/int64default"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"gopkg.in/yaml.v3"
)

var _ resource.Resource = &FlagResource{}
var _ resource.ResourceWithConfigure = &FlagResource{}

// FlagResource implements a Terraform resource for a single TinyFlag feature flag.
type FlagResource struct {
	flagsFile string
}

type FlagResourceModel struct {
	Name        types.String `tfsdk:"name"`
	Enabled     types.Bool   `tfsdk:"enabled"`
	Description types.String `tfsdk:"description"`
	Rollout     types.Int64  `tfsdk:"rollout"`
	Tags        types.List   `tfsdk:"tags"`
}

func NewFlagResource() resource.Resource {
	return &FlagResource{}
}

func (r *FlagResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_flag"
}

func (r *FlagResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a single feature flag in a TinyFlag flags file.",
		Attributes: map[string]schema.Attribute{
			"name": schema.StringAttribute{
				Description: "Flag name (kebab-case).",
				Required:    true,
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.RequiresReplace(),
				},
			},
			"enabled": schema.BoolAttribute{
				Description: "Whether the flag is globally enabled.",
				Optional:    true,
				Computed:    true,
				Default:     booldefault.StaticBool(false),
			},
			"description": schema.StringAttribute{
				Description: "Human-readable description.",
				Optional:    true,
			},
			"rollout": schema.Int64Attribute{
				Description: "Rollout percentage (0-100).",
				Optional:    true,
				Computed:    true,
				Default:     int64default.StaticInt64(100),
			},
			"tags": schema.ListAttribute{
				Description: "Categorization tags.",
				Optional:    true,
				ElementType: types.StringType,
			},
		},
	}
}

func (r *FlagResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}
	flagsFile, ok := req.ProviderData.(string)
	if !ok {
		resp.Diagnostics.AddError("Unexpected Resource Configure Type", "Expected string")
		return
	}
	r.flagsFile = flagsFile
}

func (r *FlagResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan FlagResourceModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	flags, err := r.loadFlags()
	if err != nil {
		resp.Diagnostics.AddError("Failed to load flags file", err.Error())
		return
	}

	flagDef := r.modelToFlag(ctx, plan)
	flags[plan.Name.ValueString()] = flagDef

	if err := r.saveFlags(flags); err != nil {
		resp.Diagnostics.AddError("Failed to save flags file", err.Error())
		return
	}

	resp.Diagnostics.Append(resp.State.Set(ctx, plan)...)
}

func (r *FlagResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state FlagResourceModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	flags, err := r.loadFlags()
	if err != nil {
		resp.Diagnostics.AddError("Failed to load flags file", err.Error())
		return
	}

	flagDef, exists := flags[state.Name.ValueString()]
	if !exists {
		resp.State.RemoveResource(ctx)
		return
	}

	r.flagToModel(ctx, state.Name.ValueString(), flagDef, &state)
	resp.Diagnostics.Append(resp.State.Set(ctx, state)...)
}

func (r *FlagResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan FlagResourceModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	flags, err := r.loadFlags()
	if err != nil {
		resp.Diagnostics.AddError("Failed to load flags file", err.Error())
		return
	}

	flags[plan.Name.ValueString()] = r.modelToFlag(ctx, plan)

	if err := r.saveFlags(flags); err != nil {
		resp.Diagnostics.AddError("Failed to save flags file", err.Error())
		return
	}

	resp.Diagnostics.Append(resp.State.Set(ctx, plan)...)
}

func (r *FlagResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state FlagResourceModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	flags, err := r.loadFlags()
	if err != nil {
		resp.Diagnostics.AddError("Failed to load flags file", err.Error())
		return
	}

	delete(flags, state.Name.ValueString())

	if err := r.saveFlags(flags); err != nil {
		resp.Diagnostics.AddError("Failed to save flags file", err.Error())
		return
	}
}

func (r *FlagResource) loadFlags() (map[string]map[string]interface{}, error) {
	data, err := os.ReadFile(r.flagsFile)
	if err != nil {
		if os.IsNotExist(err) {
			return make(map[string]map[string]interface{}), nil
		}
		return nil, fmt.Errorf("reading flags file: %w", err)
	}

	var doc map[string]interface{}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parsing flags file: %w", err)
	}

	flags, ok := doc["flags"].(map[string]interface{})
	if !ok {
		return make(map[string]map[string]interface{}), nil
	}

	result := make(map[string]map[string]interface{})
	for k, v := range flags {
		if flagMap, ok := v.(map[string]interface{}); ok {
			result[k] = flagMap
		}
	}
	return result, nil
}

func (r *FlagResource) saveFlags(flags map[string]map[string]interface{}) error {
	doc := map[string]interface{}{
		"version": 1,
		"flags":   flags,
	}

	data, err := yaml.Marshal(doc)
	if err != nil {
		return fmt.Errorf("marshaling flags: %w", err)
	}

	return os.WriteFile(r.flagsFile, data, 0644)
}

func (r *FlagResource) modelToFlag(_ context.Context, model FlagResourceModel) map[string]interface{} {
	flag := map[string]interface{}{
		"enabled": model.Enabled.ValueBool(),
	}

	if !model.Description.IsNull() {
		flag["description"] = model.Description.ValueString()
	}
	if !model.Rollout.IsNull() && model.Rollout.ValueInt64() < 100 {
		flag["rollout"] = model.Rollout.ValueInt64()
	}

	return flag
}

func (r *FlagResource) flagToModel(_ context.Context, name string, flag map[string]interface{}, model *FlagResourceModel) {
	model.Name = types.StringValue(name)
	if enabled, ok := flag["enabled"].(bool); ok {
		model.Enabled = types.BoolValue(enabled)
	}
	if desc, ok := flag["description"].(string); ok {
		model.Description = types.StringValue(desc)
	}
	if rollout, ok := flag["rollout"].(int); ok {
		model.Rollout = types.Int64Value(int64(rollout))
	}
}
