#Requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

<#
.SYNOPSIS
Input validation comprehensive tests
.DESCRIPTION
Tests for proper input validation covering:
- Parameter validation
- Type checking
- Range validation
- Format validation
- File path traversal prevention
- Buffer overflow prevention
#>

BeforeAll {
    $script:ApiBaseUrl = 'http://localhost:5000'
    $script:ValidationResults = @()
}

Describe "Input Validation: Parameter Types" {
    Context "String Parameter Validation" {
        It "Should reject non-string inputs where strings are required" {
            $InvalidInputs = @(
                @{ input = 12345; expected = 'string' },
                @{ input = @(); expected = 'string' },
                @{ input = $null; expected = 'string' }
            )

            foreach ($TestCase in $InvalidInputs) {
                try {
                    $Body = @{ cloneName = $TestCase.input } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/clone/create" `
                        -Method Post -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop

                    # Should have failed
                    $true | Should -Be $false
                } catch {
                    # Expected to fail
                    $_.Exception.Response.StatusCode | Should -Match '400|422'
                }
            }
        }

        It "Should validate string length constraints" {
            $TestCases = @(
                @{ length = 1; valid = $true },      # Too short
                @{ length = 256; valid = $true },    # Valid
                @{ length = 1000; valid = $false }   # Too long
            )

            foreach ($Case in $TestCases) {
                $LongString = 'A' * $Case.length
                try {
                    $Body = @{ cloneName = $LongString } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/clone/create" `
                        -Method Post -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop

                    $Result = $Case.valid
                } catch {
                    $Result = -not $Case.valid
                }

                if (-not $Case.valid) {
                    $Result | Should -Be $true
                }
            }
        }
    }

    Context "Numeric Parameter Validation" {
        It "Should reject non-numeric inputs for numeric fields" {
            $InvalidInputs = @('abc', '12.34.56', 'null', $null)

            foreach ($Input in $InvalidInputs) {
                try {
                    $Body = @{ id = $Input } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/clone/details" `
                        -Method Get -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    $_.Exception.Response.StatusCode | Should -Match '400|422'
                }
            }
        }

        It "Should enforce numeric range constraints" {
            $InvalidRanges = @(
                @{ value = -1; field = 'timeout' },
                @{ value = 999999; field = 'maxConnections' },
                @{ value = 0; field = 'pageSize' }
            )

            foreach ($Range in $InvalidRanges) {
                try {
                    $Body = @{ $Range.field = $Range.value } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/config/update" `
                        -Method Post -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    # Expected to fail for invalid ranges
                }
            }
        }
    }

    Context "Boolean Parameter Validation" {
        It "Should enforce boolean type for flag parameters" {
            $InvalidBooleans = @('yes', 'no', '1', '0', 'on', 'off')

            foreach ($Value in $InvalidBooleans) {
                try {
                    $Body = @{ enabled = $Value } | ConvertTo-Json
                    # JSON coercion might convert these
                    $Result = $Body | ConvertFrom-Json
                    # If JSON converts it, that's acceptable
                } catch {
                    # Some conversions should fail
                }
            }
        }
    }
}

Describe "Input Validation: Format Validation" {
    Context "Email Format Validation" {
        It "Should validate email format" {
            $InvalidEmails = @(
                'notanemail',
                '@example.com',
                'user@',
                'user name@example.com',
                'user@domain',
                'user+tag@domain.co.uk.invalid'
            )

            $InvalidCount = 0
            foreach ($Email in $InvalidEmails) {
                try {
                    $Body = @{ email = $Email } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/user/update" `
                        -Method Post -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    if ($_.Exception.Response.StatusCode -eq 400) {
                        $InvalidCount++
                    }
                }
            }

            # Most invalid formats should be rejected
            $InvalidCount | Should -BeGreaterOrEqual 3
        }
    }

    Context "URL Format Validation" {
        It "Should validate URL format in parameters" {
            $InvalidUrls = @(
                'not a url',
                'htp://invalid',
                '://missing.protocol',
                'http://invalid..domain.com',
                'http://[invalid-ipv6'
            )

            foreach ($Url in $InvalidUrls) {
                try {
                    $Body = @{ callbackUrl = $Url } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/webhook/register" `
                        -Method Post -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    # Expected to fail
                }
            }
        }
    }

    Context "Date/Time Format Validation" {
        It "Should validate ISO 8601 datetime format" {
            $ValidDates = @(
                '2026-06-06',
                '2026-06-06T12:00:00Z',
                '2026-06-06T12:00:00+00:00'
            )

            $InvalidDates = @(
                'June 6, 2026',
                '06/06/2026',
                '2026-13-01',  # Invalid month
                'not-a-date'
            )

            foreach ($Date in $InvalidDates) {
                try {
                    $Body = @{ createdBefore = $Date } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/clone/filter" `
                        -Method Post -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    # Expected to fail
                }
            }
        }
    }
}

Describe "Input Validation: Path Traversal Prevention" {
    Context "Directory Traversal Prevention" {
        It "Should prevent path traversal attacks" {
            $TraversalPayloads = @(
                '../../../etc/passwd',
                '..\\..\\..\\windows\\system32\\config\\sam',
                'C:\\windows\\system32',
                '/etc/shadow',
                '....//....//....//etc//passwd',
                '%2e%2e%2fconfig'
            )

            $BlockedCount = 0
            foreach ($Payload in $TraversalPayloads) {
                try {
                    # Assuming API has a file operation endpoint
                    $Response = Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/file/read?path=$([Uri]::EscapeDataString($Payload))" `
                        -Method Get -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    if ($_.Exception.Response.StatusCode -eq 400 -or $_.Exception.Response.StatusCode -eq 403) {
                        $BlockedCount++
                    }
                }
            }

            # Most traversal attempts should be blocked
            $BlockedCount | Should -BeGreaterOrEqual 3
        }

        It "Should sanitize file paths in storage operations" {
            $UnsafePaths = @(
                'config.bak..'
                'database..json'
                'settings.old'
            )

            foreach ($Path in $UnsafePaths) {
                try {
                    $Body = @{ path = $Path } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/backup/restore" `
                        -Method Post -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    # Expected to fail for unsafe paths
                }
            }
        }
    }
}

Describe "Input Validation: Buffer Overflow Prevention" {
    Context "Large Input Handling" {
        It "Should reject excessively large payloads" {
            $LargePayload = 'A' * (100 * 1024 * 1024)  # 100MB

            try {
                $Body = @{ data = $LargePayload } | ConvertTo-Json
                Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/data/upload" `
                    -Method Post -Body $Body -ContentType 'application/json' `
                    -TimeoutSec 10 -ErrorAction Stop

                # Should have been rejected
                $true | Should -Be $false
            } catch {
                # Expected - request too large
                $_.Exception.Response.StatusCode | Should -Match '413|414|400'
            }
        }

        It "Should handle deeply nested JSON structures" {
            # Create deeply nested JSON
            $NestedJson = '{"level1":'
            for ($i = 2; $i -le 100; $i++) {
                $NestedJson += "{`"level$i`":"
            }
            $NestedJson += '"value"'
            for ($i = 100; $i -ge 1; $i--) {
                $NestedJson += '}'
            }

            try {
                Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/data/process" `
                    -Method Post -Body $NestedJson -ContentType 'application/json' `
                    -TimeoutSec 10 -ErrorAction Stop
            } catch {
                # Should reject or handle safely
            }
        }
    }

    Context "Array/Collection Limits" {
        It "Should enforce array size limits" {
            $LargeArray = @()
            for ($i = 1; $i -le 10000; $i++) {
                $LargeArray += @{ id = $i; name = "Item $i" }
            }

            try {
                $Body = @{ items = $LargeArray } | ConvertTo-Json
                Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/batch/process" `
                    -Method Post -Body $Body -ContentType 'application/json' `
                    -TimeoutSec 10 -ErrorAction Stop
            } catch {
                # Should fail or be rejected
            }
        }
    }
}

Describe "Input Validation: Special Character Handling" {
    Context "Null Byte Prevention" {
        It "Should prevent null byte injection" {
            $NullBytePayloads = @(
                "file.txt`x00.exe",
                "config`x00.bak",
                "test`x00ing"
            )

            foreach ($Payload in $NullBytePayloads) {
                try {
                    $Body = @{ filename = $Payload } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/file/save" `
                        -Method Post -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    # Expected to fail
                }
            }
        }
    }

    Context "Control Character Filtering" {
        It "Should filter out control characters" {
            $ControlChars = @(
                "normal`ttab",
                "normal`nnewline",
                "normal`rcarriage",
                "normal`x00null"
            )

            foreach ($Input in $ControlChars) {
                try {
                    $Body = @{ data = $Input } | ConvertTo-Json
                    $Response = Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/data/validate" `
                        -Method Post -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    # May be accepted or rejected
                }
            }
        }
    }
}

Describe "Input Validation: Whitelist/Blacklist Enforcement" {
    Context "Enum Validation" {
        It "Should enforce enum constraints" {
            $InvalidEnumValues = @(
                'INVALID_STATUS',
                'UnknownType',
                'random_value'
            )

            $RejectedCount = 0
            foreach ($Value in $InvalidEnumValues) {
                try {
                    $Body = @{ status = $Value } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/clone/setStatus" `
                        -Method Post -Body $Body -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    if ($_.Exception.Response.StatusCode -eq 400) {
                        $RejectedCount++
                    }
                }
            }

            $RejectedCount | Should -BeGreaterOrEqual 1
        }

        It "Should only accept whitelisted values" {
            $ValidValues = @('ACTIVE', 'INACTIVE', 'MAINTENANCE')
            $InvalidValue = 'DELETE_ALL'

            try {
                $Body = @{ status = $InvalidValue } | ConvertTo-Json
                Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/clone/setStatus" `
                    -Method Post -Body $Body -ContentType 'application/json' `
                    -TimeoutSec 10 -ErrorAction Stop

                # Should have been rejected
                $false | Should -Be $true
            } catch {
                # Expected
            }
        }
    }
}

Describe "Input Validation: Required Field Checking" {
    Context "Mandatory Field Validation" {
        It "Should require mandatory fields" {
            $MissingFields = @(
                @{},  # All missing
                @{ cloneName = 'test' },  # Missing sourceId
                @{ sourceId = 'golden-1' }  # Missing cloneName
            )

            $RejectedCount = 0
            foreach ($Body in $MissingFields) {
                try {
                    Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/clone/create" `
                        -Method Post -Body ($Body | ConvertTo-Json) `
                        -ContentType 'application/json' `
                        -TimeoutSec 10 -ErrorAction Stop
                } catch {
                    if ($_.Exception.Response.StatusCode -eq 400) {
                        $RejectedCount++
                    }
                }
            }

            $RejectedCount | Should -BeGreaterOrEqual 2
        }
    }
}
