package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ provider.Provider = &TinyFlagProvider{}

// TinyFlagProvider implements the Terraform provider for TinyFlag.
type TinyFlagProvider struct {
	version string
}

type TinyFlagProviderModel struct {
	FlagsFile types.String `tfsdk:"flags_file"`
}

func New(version string) func() provider.Provider {
	return func() provider.Provider {
		return &TinyFlagProvider{version: version}
	}
}

func (p *TinyFlagProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "tinyflag"
	resp.Version = p.version
}

func (p *TinyFlagProvider) Schema(_ context.Context, _ provider.SchemaRequest, resp *provider.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Terraform provider for managing TinyFlag feature flag files as infrastructure-as-code.",
		Attributes: map[string]schema.Attribute{
			"flags_file": schema.StringAttribute{
				Description: "Path to the flags YAML/JSON file to manage.",
				Optional:    true,
			},
		},
	}
}

func (p *TinyFlagProvider) Configure(ctx context.Context, req provider.ConfigureRequest, resp *provider.ConfigureResponse) {
	var config TinyFlagProviderModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	flagsFile := "flags.yml"
	if !config.FlagsFile.IsNull() {
		flagsFile = config.FlagsFile.ValueString()
	}

	resp.DataSourceData = flagsFile
	resp.ResourceData = flagsFile
}

func (p *TinyFlagProvider) Resources(_ context.Context) []func() resource.Resource {
	return []func() resource.Resource{
		NewFlagResource,
	}
}

func (p *TinyFlagProvider) DataSources(_ context.Context) []func() datasource.DataSource {
	return nil
}
