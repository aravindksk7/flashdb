namespace FlashDB.Api.Models;

// Golden Image DTOs
public class GoldenImageDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string Method { get; set; } = string.Empty;
    public string ParentVhdxPath { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public long SizeBytes { get; set; }
    public string ParentHash { get; set; } = string.Empty;
    public string VerificationStatus { get; set; } = "unverified";
}

public class CreateGoldenImageRequest
{
    public string Name { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string Method { get; set; } = "BackupRestore"; // BackupRestore, ReplicaBackup, TableByTableCopy
    public string OutputPath { get; set; } = string.Empty;
    public string? BackupFile { get; set; }
    public string? SourceConnection { get; set; }
}

public class UpdateGoldenImageRequest
{
    public string? BackupFile { get; set; }
    public string? SourceConnection { get; set; }
}

// Clone DTOs
public class CloneDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string GoldenImageId { get; set; } = string.Empty;
    public string VhdxPath { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string InstancePath { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public long SizeBytes { get; set; }
}

public class CreateCloneRequest
{
    public string GoldenImageId { get; set; } = string.Empty;
    public string CloneName { get; set; } = string.Empty;
    public string InstancePath { get; set; } = string.Empty;
    public string StoragePath { get; set; } = string.Empty;
    public bool CompressionEnabled { get; set; } = true;
}

public class CloneActionRequest
{
    public string CloneId { get; set; } = string.Empty;
    public string? InstancePath { get; set; }
}

// Checkpoint DTOs
public class CheckpointDto
{
    public string CheckpointId { get; set; } = string.Empty;
    public string CloneId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Phase { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public string[] Labels { get; set; } = Array.Empty<string>();
    public long RowCount { get; set; }
    public long DataSizeBytes { get; set; }
}

public class CreateCheckpointRequest
{
    public string CloneId { get; set; } = string.Empty;
    public string CheckpointName { get; set; } = string.Empty;
    public string Phase { get; set; } = "manual"; // pre-etl, post-etl, manual
    public string? Description { get; set; }
    public bool Force { get; set; }
}

public class UpdateCheckpointRequest
{
    public bool? IsFavorite { get; set; }
    public string[]? Labels { get; set; }
}

public class CheckpointRestoreRequest
{
    public string CloneId { get; set; } = string.Empty;
    public string CheckpointId { get; set; } = string.Empty;
    public bool ReattachAfter { get; set; } = true;
}

public class CheckpointDiffRequest
{
    public string CloneId { get; set; } = string.Empty;
    public string SourceCheckpointId { get; set; } = string.Empty;
    public string TargetCheckpointId { get; set; } = string.Empty;
}

public class CheckpointDiffDto
{
    public string SourceCheckpointId { get; set; } = string.Empty;
    public string TargetCheckpointId { get; set; } = string.Empty;
    public TableDiffDto[] TableDiffs { get; set; } = Array.Empty<TableDiffDto>();
    public long TotalRowCountDelta { get; set; }
    public long TotalSizeDelta { get; set; }
    public int TablesModified { get; set; }
    public int TablesUnchanged { get; set; }
}

public class TableDiffDto
{
    public string TableName { get; set; } = string.Empty;
    public long RowCountSource { get; set; }
    public long RowCountTarget { get; set; }
    public long RowCountDelta { get; set; }
    public long SizeSource { get; set; }
    public long SizeTarget { get; set; }
    public bool SchemaChanged { get; set; }
}

// API Response DTOs
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public T? Data { get; set; }
    public string? Message { get; set; }
    public Dictionary<string, string[]>? Errors { get; set; }
}

public class ApiResponse
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public Dictionary<string, string[]>? Errors { get; set; }
}
