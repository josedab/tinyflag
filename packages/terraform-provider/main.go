package main

import (
	"context"
	"log"

	"github.com/hashicorp/terraform-plugin-framework/providerserver"
	"github.com/josedab/terraform-provider-tinyflag/internal/provider"
)

var version = "0.1.0"

func main() {
	opts := providerserver.ServeOpts{
		Address: "registry.terraform.io/josedab/tinyflag",
	}

	err := providerserver.Serve(context.Background(), provider.New(version), opts)
	if err != nil {
		log.Fatal(err.Error())
	}
}
