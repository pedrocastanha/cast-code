import { Module } from '@nestjs/common';
import { McpClientService } from './services/mcp-client.service';
import { McpRegistryService } from './services/mcp-registry.service';
import { McpRiskScannerService } from './services/mcp-risk-scanner.service';
import { McpCapabilityService } from './services/mcp-capability.service';
import { McpApprovalPolicyService } from './services/mcp-approval-policy.service';

@Module({
  providers: [McpClientService, McpRegistryService, McpRiskScannerService, McpCapabilityService, McpApprovalPolicyService],
  exports: [McpClientService, McpRegistryService, McpRiskScannerService, McpCapabilityService, McpApprovalPolicyService],
})
export class McpModule {}
