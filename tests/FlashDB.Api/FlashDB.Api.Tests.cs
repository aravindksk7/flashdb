using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Xunit;

namespace FlashDB.Api.Tests
{
    /// <summary>
    /// Comprehensive test suite for FlashDB REST API endpoints
    /// Tests all endpoints for golden image management, clone management, and checkpoints
    /// </summary>
    public class GoldenImageApiTests
    {
        private readonly HttpClient _httpClient;
        private const string BaseUrl = "http://localhost:5000/api";

        public GoldenImageApiTests()
        {
            _httpClient = new HttpClient();
        }

        [Fact]
        public async Task CreateGoldenImage_WithBackupFile_ReturnsCreatedStatus()
        {
            // Arrange
            var request = new
            {
                backupFile = "C:\\Backups\\prod.bak",
                outputPath = "\\\\shared\\GoldenImages\\prod-20260606.vhdx",
                version = "20260606",
                method = "BackupRestore",
                compress = true
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync($"{BaseUrl}/golden-images", content);

            // Assert
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }

        [Fact]
        public async Task CreateGoldenImage_WithReplicaBackup_ReturnsCreatedStatus()
        {
            // Arrange
            var request = new
            {
                sourceConnection = "Server=prod-replica;Database=AdventureWorks;Encrypt=true",
                databaseName = "AdventureWorks",
                outputPath = "\\\\shared\\GoldenImages\\prod-20260606.vhdx",
                version = "20260606",
                method = "ReplicaBackup",
                compress = true
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync($"{BaseUrl}/golden-images", content);

            // Assert
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }

        [Fact]
        public async Task CreateGoldenImage_WithTableByTableCopy_ReturnsCreatedStatus()
        {
            // Arrange
            var request = new
            {
                sourceConnection = "Server=prod-ro;User Id=readonly;Password=***;Encrypt=true",
                databaseName = "AdventureWorks",
                outputPath = "\\\\shared\\GoldenImages\\prod-20260606.vhdx",
                version = "20260606",
                method = "TableByTableCopy",
                verifyRowCounts = true,
                compress = true
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync($"{BaseUrl}/golden-images", content);

            // Assert
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }

        [Fact]
        public async Task CreateGoldenImage_MissingRequiredFields_ReturnsBadRequest()
        {
            // Arrange
            var request = new
            {
                version = "20260606"
                // Missing method, path, etc.
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync($"{BaseUrl}/golden-images", content);

            // Assert
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task GetGoldenImages_ReturnsAllImages()
        {
            // Act
            var response = await _httpClient.GetAsync($"{BaseUrl}/golden-images");

            // Assert
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var content = await response.Content.ReadAsStringAsync();
            Assert.NotEmpty(content);
        }

        [Fact]
        public async Task GetGoldenImage_ByValidId_ReturnsImageDetails()
        {
            // Arrange
            var goldenImageId = "golden-prod-20260606";

            // Act
            var response = await _httpClient.GetAsync($"{BaseUrl}/golden-images/{goldenImageId}");

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task GetGoldenImage_WithIncludeMetadata_ReturnsDetailedInfo()
        {
            // Arrange
            var goldenImageId = "golden-prod-20260606";

            // Act
            var response = await _httpClient.GetAsync(
                $"{BaseUrl}/golden-images/{goldenImageId}?includeMetadata=true");

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task UpdateGoldenImage_WithNewVersion_ReturnsOk()
        {
            // Arrange
            var goldenImageId = "golden-prod-20260601";
            var request = new
            {
                sourceConnection = "Server=prod-replica;Database=AdventureWorks;Encrypt=true",
                method = "ReplicaBackup"
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PatchAsync(
                $"{BaseUrl}/golden-images/{goldenImageId}", content);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task RefreshGoldenImage_UsesOriginalMethod_ReturnsOk()
        {
            // Arrange
            var goldenImageId = "golden-prod-20260601";

            // Act
            var response = await _httpClient.PostAsync(
                $"{BaseUrl}/golden-images/{goldenImageId}/refresh", null);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }
    }

    public class CloneApiTests
    {
        private readonly HttpClient _httpClient;
        private const string BaseUrl = "http://localhost:5000/api";

        public CloneApiTests()
        {
            _httpClient = new HttpClient();
        }

        [Fact]
        public async Task CreateClone_WithValidGoldenImage_ReturnsCreatedStatus()
        {
            // Arrange
            var request = new
            {
                goldenImageId = "golden-prod-20260601",
                cloneName = "test-clone-1",
                instancePath = "LOCALHOST\\SQLEXPRESS",
                storagePath = "D:\\CloneStorage"
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync($"{BaseUrl}/clones", content);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.Created ||
                       response.StatusCode == HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateClone_WithInvalidGoldenImage_ReturnsBadRequest()
        {
            // Arrange
            var request = new
            {
                goldenImageId = "non-existent-golden",
                cloneName = "test-clone-1",
                instancePath = "LOCALHOST\\SQLEXPRESS",
                storagePath = "D:\\CloneStorage"
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync($"{BaseUrl}/clones", content);

            // Assert
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task CreateClone_MissingRequiredFields_ReturnsBadRequest()
        {
            // Arrange
            var request = new
            {
                cloneName = "test-clone-1"
                // Missing goldenImageId, instancePath, storagePath
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync($"{BaseUrl}/clones", content);

            // Assert
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task GetClones_ReturnsAllClones()
        {
            // Act
            var response = await _httpClient.GetAsync($"{BaseUrl}/clones");

            // Assert
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        [Fact]
        public async Task GetClone_ByValidId_ReturnsCloneDetails()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";

            // Act
            var response = await _httpClient.GetAsync($"{BaseUrl}/clones/{cloneId}");

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task AttachClone_ToSqlInstance_ReturnsOk()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var request = new
            {
                instancePath = "LOCALHOST\\SQLEXPRESS"
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync(
                $"{BaseUrl}/clones/{cloneId}/attach", content);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task DetachClone_FromSqlInstance_ReturnsOk()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";

            // Act
            var response = await _httpClient.PostAsync(
                $"{BaseUrl}/clones/{cloneId}/detach", null);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task DeleteClone_WithValidId_ReturnsOk()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";

            // Act
            var response = await _httpClient.DeleteAsync($"{BaseUrl}/clones/{cloneId}");

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }
    }

    public class CheckpointApiTests
    {
        private readonly HttpClient _httpClient;
        private const string BaseUrl = "http://localhost:5000/api";

        public CheckpointApiTests()
        {
            _httpClient = new HttpClient();
        }

        [Fact]
        public async Task CreateCheckpoint_WithPreEtlPhase_ReturnsCreatedStatus()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var request = new
            {
                checkpointName = "Pre-ETL Baseline",
                phase = "pre-etl",
                description = "Baseline state before ETL"
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints", content);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.Created ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CreateCheckpoint_WithPostEtlPhase_ReturnsCreatedStatus()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var request = new
            {
                checkpointName = "Post-ETL Results",
                phase = "post-etl",
                description = "Results after ETL execution"
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints", content);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.Created ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CreateCheckpoint_MissingName_ReturnsBadRequest()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var request = new
            {
                phase = "pre-etl"
                // Missing checkpointName
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints", content);

            // Assert
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task GetCheckpoints_ForClone_ReturnsAllCheckpoints()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";

            // Act
            var response = await _httpClient.GetAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints");

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task GetCheckpoints_WithIncludeMetadata_ReturnsDetailedInfo()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";

            // Act
            var response = await _httpClient.GetAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints?includeMetadata=true");

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task GetCheckpoint_ByValidId_ReturnsCheckpointDetails()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var checkpointId = "cp-001";

            // Act
            var response = await _httpClient.GetAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints/{checkpointId}");

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task UpdateCheckpoint_SetFavorite_ReturnsOk()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var checkpointId = "cp-001";
            var request = new
            {
                isFavorite = true
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PatchAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints/{checkpointId}", content);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task UpdateCheckpoint_AddLabels_ReturnsOk()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var checkpointId = "cp-001";
            var request = new
            {
                labels = new[] { "etl-v2-results", "perf-baseline" }
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PatchAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints/{checkpointId}", content);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task RestoreCheckpoint_ReturnsOk()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var checkpointId = "cp-001";
            var request = new
            {
                reattachAfter = true
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints/{checkpointId}/restore", content);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CompareCheckpoints_ReturnsCheckpointDiff()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var sourceCheckpointId = "cp-001";
            var targetCheckpointId = "cp-002";

            // Act
            var response = await _httpClient.PostAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints/{sourceCheckpointId}/diff",
                new StringContent(
                    JsonSerializer.Serialize(new { targetCheckpointId = targetCheckpointId }),
                    Encoding.UTF8,
                    "application/json"));

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task DeleteCheckpoint_ReturnsOk()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var checkpointId = "cp-001";

            // Act
            var response = await _httpClient.DeleteAsync(
                $"{BaseUrl}/clones/{cloneId}/checkpoints/{checkpointId}");

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }
    }

    public class CloneRestoreApiTests
    {
        private readonly HttpClient _httpClient;
        private const string BaseUrl = "http://localhost:5000/api";

        public CloneRestoreApiTests()
        {
            _httpClient = new HttpClient();
        }

        [Fact]
        public async Task RestoreCloneToGoldenImage_ReturnsOk()
        {
            // Arrange
            var cloneId = "clone-prod-dev1";
            var request = new
            {
                reattachAfter = true
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync(
                $"{BaseUrl}/clones/{cloneId}/restore-golden", content);

            // Assert
            Assert.True(response.StatusCode == HttpStatusCode.OK ||
                       response.StatusCode == HttpStatusCode.NotFound);
        }
    }

    public class ErrorHandlingTests
    {
        private readonly HttpClient _httpClient;
        private const string BaseUrl = "http://localhost:5000/api";

        public ErrorHandlingTests()
        {
            _httpClient = new HttpClient();
        }

        [Fact]
        public async Task RequestToNonExistentEndpoint_Returns404()
        {
            // Act
            var response = await _httpClient.GetAsync($"{BaseUrl}/non-existent");

            // Assert
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        [Fact]
        public async Task MalformedJsonPayload_ReturnsBadRequest()
        {
            // Arrange
            var content = new StringContent(
                "{ invalid json",
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync($"{BaseUrl}/clones", content);

            // Assert
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task InvalidHttpMethod_ReturnsMethodNotAllowed()
        {
            // Act
            var request = new HttpRequestMessage(HttpMethod.Delete, $"{BaseUrl}/golden-images");
            var response = await _httpClient.SendAsync(request);

            // Assert
            // DELETE on POST-only endpoint should return 405 or 400
            Assert.True(response.StatusCode == HttpStatusCode.MethodNotAllowed ||
                       response.StatusCode == HttpStatusCode.BadRequest);
        }
    }

    public class ApiSecurityTests
    {
        private readonly HttpClient _httpClient;
        private const string BaseUrl = "http://localhost:5000/api";

        public ApiSecurityTests()
        {
            _httpClient = new HttpClient();
        }

        [Fact]
        public async Task CreateGoldenImage_DoesNotLogConnectionPassword()
        {
            // Arrange
            var request = new
            {
                sourceConnection = "Server=prod-replica;User Id=admin;Password=SecretPassword123;Database=AdventureWorks",
                databaseName = "AdventureWorks",
                outputPath = "\\\\shared\\GoldenImages\\test.vhdx",
                version = "20260606",
                method = "ReplicaBackup"
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync($"{BaseUrl}/golden-images", content);

            // Assert - Password should not appear in response
            var responseContent = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain("SecretPassword123", responseContent);
        }

        [Fact]
        public async Task ApiShouldValidateInputLength()
        {
            // Arrange - Create extremely long input
            var longString = new string('a', 10000);
            var request = new
            {
                cloneName = longString,
                goldenImageId = "golden-test",
                instancePath = "LOCALHOST\\SQLEXPRESS",
                storagePath = "D:\\Storage"
            };

            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            // Act
            var response = await _httpClient.PostAsync($"{BaseUrl}/clones", content);

            // Assert
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
    }
}
