import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiOkResponse, ApiNotFoundResponse, ApiBadRequestResponse } from '@nestjs/swagger';
import { UpdateHistoricalTeamDto } from './dto/update-historical-team.dto';
import { UpdateHistoricalMemberDto } from './dto/update-historical-member.dto';
import { UpdateHistoricalVideogameDto } from './dto/update-historical-videogame.dto';
import { HistoricalsService } from './historicals.service';
import { Public } from '../auth/decorators/public.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';

@Controller('historicals')
export class HistoricalsController {
  constructor(private readonly historicalsService: HistoricalsService) {}

  @Get('historical-teams')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHistoricals')
  @ApiOperation({ summary: 'Get all historical teams' })
  @ApiOkResponse({ description: 'Historical teams retrieved successfully' })
  getAllHistoricalTeams() {
    return this.historicalsService.getAllHistoricalTeams();
  }

  @Get('historical-teams/:editionId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHistoricals')
  @ApiOperation({ summary: 'Get historical teams of a specific edition' })
  @ApiOkResponse({ description: 'Historical teams retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Edition not found' })
  @ApiBadRequestResponse({ description: 'Invalid edition ID' })
  getHistoricalTeams(@Param('editionId') editionId: number) {
    return this.historicalsService.getHistoricalTeamsByEdition(editionId);
  }
  
  @Get('historical-members/:TeamId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHistoricals')
  @ApiOperation({ summary: 'Get historical members of a specific team' })
  @ApiOkResponse({ description: 'Historical members retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Team not found' })
  @ApiBadRequestResponse({ description: 'Invalid team ID' })
  getHistoricalMembers(@Param('TeamId') teamId: number) {
    return this.historicalsService.getHistoricalMembersByTeam(teamId);
  }

  @Public()
  @Get('historical-videogames/:editionId')
  @ApiOperation({ summary: 'Get historical videogames of a specific edition' })
  @ApiOkResponse({ description: 'Historical videogames retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Edition not found or no historical videogames available' })
  @ApiBadRequestResponse({ description: 'Invalid edition ID' })
  getHistoricalVideogames(@Param('editionId') editionId: number) {
    return this.historicalsService.getHistoricalVideogamesByEdition(editionId);
  }

  @Public()
  @Get('historical-teams-with-scores/:editionId')
  @ApiOperation({ summary: 'Get historical teams of a specific edition, sorted by finalScore DESC' })
  @ApiOkResponse({ description: 'Historical teams with scores retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Edition not found or no historical teams available' })
  @ApiBadRequestResponse({ description: 'Invalid edition ID' })
  getHistoricalTeamsWithScores(@Param('editionId') editionId: number) {
    return this.historicalsService.getHistoricalTeamsWithScores(editionId);
  }

  @Post('create-historical-edition-dump/:editionId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHistoricals')
  @ApiOperation({ summary: 'Create a historical dump (Teams, team members and videogames) for a specific edition' })
  @ApiOkResponse({ description: 'Dump created successfully' })
  @ApiNotFoundResponse({ description: 'Edition not found' })
  @ApiBadRequestResponse({ description: 'Invalid edition ID or existing dump found' })
  @HttpCode(200)
  create(@Param('editionId') editionId: number) {
    return this.historicalsService.createHistoricalEditionDump(editionId);
  }

  @Patch('update-historical-team/:historicalTeamId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHistoricals')
  @ApiOperation({ summary: 'Update a historical team' })
  @ApiBody({ type: UpdateHistoricalTeamDto })
  @ApiOkResponse({ description: 'Historical team updated successfully' })
  @ApiNotFoundResponse({ description: 'Historical team not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  updateHistoricalTeam(@Param('historicalTeamId') historicalTeamId: number, @Body() updateData: UpdateHistoricalTeamDto) {
    return this.historicalsService.updateHistoricalTeam(historicalTeamId, updateData);
  }

  @Patch('update-historical-member/:historicalMemberId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHistoricals')
  @ApiOperation({ summary: 'Update a historical member' })
  @ApiBody({ type: UpdateHistoricalMemberDto })
  @ApiOkResponse({ description: 'Historical member updated successfully' })
  @ApiNotFoundResponse({ description: 'Historical member not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  updateHistoricalMember(@Param('historicalMemberId') historicalMemberId: number, @Body() updateData: UpdateHistoricalMemberDto) {
    return this.historicalsService.updateHistoricalMember(historicalMemberId, updateData);
  }

  @Patch('update-historical-videogame/:historicalVideogameId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHistoricals')
  @ApiOperation({ summary: 'Update a historical videogame' })
  @ApiBody({ type: UpdateHistoricalVideogameDto })
  @ApiOkResponse({ description: 'Historical videogame updated successfully' })
  @ApiNotFoundResponse({ description: 'Historical videogame not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  updateHistoricalVideogame(@Param('historicalVideogameId') historicalVideogameId: number, @Body() updateData: UpdateHistoricalVideogameDto) {
    return this.historicalsService.updateHistoricalVideogame(historicalVideogameId, updateData);
  }

  @Delete('remove-historical-team/:historicalTeamId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHistoricals')
  @ApiOperation({ summary: 'Remove a historical team' })
  @ApiOkResponse({ description: 'Historical team removed successfully' })
  @ApiNotFoundResponse({ description: 'Historical team not found' })
  @ApiBadRequestResponse({ description: 'Invalid historical team ID' })
  removeHistoricalTeam(@Param('historicalTeamId') historicalTeamId: number) {
    return this.historicalsService.removeHistoricalTeam(historicalTeamId);
  }

  @Delete('remove-historical-member/:historicalMemberId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHistoricals')
  @ApiOperation({ summary: 'Remove a historical member' })
  @ApiOkResponse({ description: 'Historical member removed successfully' })
  @ApiNotFoundResponse({ description: 'Historical member not found' })
  @ApiBadRequestResponse({ description: 'Invalid historical member ID' })
  removeHistoricalMember(@Param('historicalMemberId') historicalMemberId: number) {
    return this.historicalsService.removeHistoricalMember(historicalMemberId);
  }

  @Delete('remove-historical-videogame/:historicalVideogameId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHistoricals')
  @ApiOperation({ summary: 'Remove a historical videogame' })
  @ApiOkResponse({ description: 'Historical videogame removed successfully' })
  @ApiNotFoundResponse({ description: 'Historical videogame not found' })
  @ApiBadRequestResponse({ description: 'Invalid historical videogame ID' })
  removeHistoricalVideogame(@Param('historicalVideogameId') historicalVideogameId: number) {
    return this.historicalsService.removeHistoricalVideogame(historicalVideogameId);
  }
}
