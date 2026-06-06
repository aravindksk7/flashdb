using Serilog;
using FlashDB.Api.Services;
using FlashDB.Api.Middleware;

// Configure Serilog
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .WriteTo.Console()
    .WriteTo.File("logs/flashdb-api-.txt", rollingInterval: RollingInterval.Day)
    .CreateLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Add Serilog
    builder.Host.UseSerilog();

    // Add services
    builder.Services.AddControllers();
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new() { Title = "FlashDB API", Version = "v0.1.0" });
    });

    // Add FlashDB services
    builder.Services.AddSingleton<IPowerShellService, PowerShellService>();
    builder.Services.AddScoped<IGoldenImageService, GoldenImageService>();
    builder.Services.AddScoped<ICloneService, CloneService>();
    builder.Services.AddScoped<ICheckpointService, CheckpointService>();

    // Add CORS for GUI client
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowGui", policy =>
        {
            policy.WithOrigins("http://localhost:5000", "http://localhost:3000")
                  .AllowAnyMethod()
                  .AllowAnyHeader();
        });
    });

    var app = builder.Build();

    // Configure pipeline
    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }

    app.UseHttpsRedirection();
    app.UseCors("AllowGui");
    app.UseMiddleware<ErrorHandlingMiddleware>();

    app.MapControllers();

    Log.Information("FlashDB API starting on {Date}", DateTime.UtcNow);
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    await Log.CloseAndFlushAsync();
}
